/**
 * CORS proxy rotation — heavy redundancy edition.
 *
 * Browsers block cross-origin `fetch()` against most websites because they
 * don't send `Access-Control-Allow-Origin`. The icon engine works around
 * this by routing through public CORS proxies. **None of these proxies are
 * individually reliable** — they rate-limit, return 502s for some hosts,
 * disappear without warning, or rate-limit specific user agents.
 *
 * The engine treats this as a reliability problem, not a performance one:
 * we maintain a deep pool of proxies and try every single one in sequence
 * until something succeeds. Worst case for one HTML scrape is ~12 round
 * trips; that's fine because:
 *
 *   • Every successful resolve is persisted as a `data:` URL in
 *     IndexedDB and never re-fetched.
 *   • The user only ever pays this cost on first add of a new bookmark.
 *
 * Privacy: the only thing we send to a proxy is the public URL the user
 * has already chosen to bookmark. No cookies, no headers from the user,
 * no body.
 */

import { logger } from "@/lib/logger";

type ProxyWrap = (url: string) => string;

/**
 * Proxy wrappers, ordered by historical reliability (most-reliable first).
 * Each entry is a pure URL transform; the engine doesn't care which proxy
 * actually replied.
 *
 * We intentionally exclude proxies that have ENS resolution issues
 * (`thingproxy.freeboard.io`, `yacdn.org`) or that block server-side
 * requests entirely from the free tier (`corsproxy.io` for non-browser
 * origins). They're untrustworthy enough to be net-negative — they slow
 * down the chain and produce DevTools-console noise without ever
 * succeeding.
 */
const PROXIES: ProxyWrap[] = [
  // 1. allorigins — most reliable for HTML scrape, occasional rate-limit
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  // 2. corsproxy.io — works from real browser origins (paid for server-to-server)
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  // 3. codetabs — slower but very stable
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  // 4. cors.lol — fast, occasional 429
  (url) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
  // 5. corsfix — newer, generally available
  (url) => `https://proxy.corsfix.com/?${encodeURIComponent(url)}`,
  // 6. proxy.cors.sh — community-run, often available when others 429
  (url) => `https://proxy.cors.sh/${url}`,
  // 7. cors-anywhere — Heroku-hosted, frequently rate-limited but free
  (url) => `https://cors-anywhere.herokuapp.com/${url}`,
];

const PER_PROXY_TIMEOUT_MS = 8_000;

interface ProxiedFetchResult {
  text: string;
  finalUrl: string;
  via: string;
}

interface ProxiedBlobResult {
  blob: Blob;
  finalUrl: string;
  via: string;
}

/**
 * Walk the proxy pool, one at a time, until one returns a non-empty
 * response. Tries all of them — reliability over speed.
 */
export async function fetchHtmlViaProxy(
  targetUrl: string,
  signal?: AbortSignal,
): Promise<ProxiedFetchResult | null> {
  for (let i = 0; i < PROXIES.length; i++) {
    if (signal?.aborted) return null;
    const wrapped = PROXIES[i](targetUrl);
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), PER_PROXY_TIMEOUT_MS);
      const onUserAbort = () => ac.abort();
      signal?.addEventListener("abort", onUserAbort, { once: true });
      try {
        const resp = await fetch(wrapped, {
          signal: ac.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
          headers: { Accept: "text/html,application/xhtml+xml,*/*" },
        });
        if (resp.ok) {
          const text = await resp.text();
          // Reject error-page responses some proxies return as 200.
          if (text.length > 200 && !looksLikeProxyError(text)) {
            return { text, finalUrl: targetUrl, via: `proxy:${i}` };
          }
        }
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onUserAbort);
      }
    } catch (err) {
      logger.debug("[icon-proxy] proxy", i, "html failed", err);
    }
  }
  return null;
}

/**
 * Same as `fetchHtmlViaProxy` but returns the raw `Blob` so the caller can
 * base64-encode binary icons.
 */
export async function fetchBlobViaProxy(
  targetUrl: string,
  signal?: AbortSignal,
): Promise<ProxiedBlobResult | null> {
  for (let i = 0; i < PROXIES.length; i++) {
    if (signal?.aborted) return null;
    const wrapped = PROXIES[i](targetUrl);
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), PER_PROXY_TIMEOUT_MS);
      const onUserAbort = () => ac.abort();
      signal?.addEventListener("abort", onUserAbort, { once: true });
      try {
        const resp = await fetch(wrapped, {
          signal: ac.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
          headers: { Accept: "image/*,*/*;q=0.8" },
        });
        if (!resp.ok) continue;
        const blob = await resp.blob();
        if (looksLikeImageBlob(blob)) {
          return { blob, finalUrl: targetUrl, via: `proxy:${i}` };
        }
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onUserAbort);
      }
    } catch (err) {
      logger.debug("[icon-proxy] proxy", i, "blob failed", err);
    }
  }
  return null;
}

export async function fetchTextViaProxy(
  targetUrl: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const r = await fetchHtmlViaProxy(targetUrl, signal);
  return r ? r.text : null;
}

// ─── helpers ────────────────────────────────────────────────────────────

function looksLikeProxyError(text: string): boolean {
  if (text.length < 4_000) {
    const lower = text.toLowerCase();
    return (
      lower.includes("\"error\":") ||
      lower.includes("rate limit") ||
      lower.includes("upgrade at") ||
      lower.includes("cors-anywhere") ||
      lower.includes("403 forbidden") ||
      lower.includes("502 bad gateway")
    );
  }
  return false;
}

function looksLikeImageBlob(blob: Blob): boolean {
  if (blob.size < 100) return false;
  const type = (blob.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  if (type.includes("icon") || type.includes("octet-stream")) return true;
  // Some proxies strip Content-Type entirely. Reject obvious HTML errors
  // but accept anything plausible — the caller validates again via
  // `<img>` probing.
  if (type.includes("text/html")) return false;
  if (type.includes("application/json")) return false;
  if (type.startsWith("text/")) return false;
  return true;
}
