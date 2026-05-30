/**
 * Chrome extension bridge — fast and deep paths.
 *
 * The extension's background service worker has two icon-extraction
 * superpowers the plain web app cannot match:
 *
 *   1. **Static path** (`EXTRACT_ICON`) — `fetch()` cross-origin pages and
 *      parse their HTML. CORS is irrelevant because the extension has
 *      `host_permissions: ['<all_urls>']`. Returns a base64 data URL.
 *
 *   2. **Deep path** (`EXTRACT_ICON_DEEP`) — *opens the URL in a hidden
 *      background tab*, lets the page execute JavaScript with the user's
 *      cookies, then injects a script via `chrome.scripting.executeScript`
 *      that reads the live DOM's `<link rel="icon">` declarations,
 *      manifest.json icons, and og:image meta — i.e. exactly what Chrome
 *      itself sees in the tab strip. Closes the tab afterwards. Slow
 *      (~5–10s per host) but extraordinarily reliable: works for SPA
 *      Google products that mutate the head client-side, authenticated
 *      sites, and anything else that stumps static scraping.
 *
 * Outside the extension (`localhost`, deployed web app), `chrome.runtime`
 * is undefined and these methods silently no-op.
 */

import { logger } from "@/lib/logger";
import { isChromeExtension } from "@/lib/env";

interface ExtractResponse {
  success?: boolean;
  iconDataUrl?: string;
  source?: string;
  size?: number;
  error?: string;
}

interface ExtractedIcon {
  url: string;
  source: string;
  size?: number;
}

const FAST_TIMEOUT_MS = 12_000;
const DEEP_TIMEOUT_MS = 25_000;

function sendMessage(
  type: "EXTRACT_ICON" | "EXTRACT_ICON_DEEP",
  pageUrl: string,
  timeoutMs: number,
): Promise<ExtractedIcon | null> {
  if (!isChromeExtension()) return Promise.resolve(null);
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: ExtractedIcon | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      chrome.runtime.sendMessage(
        { type, url: pageUrl },
        (response: ExtractResponse | undefined) => {
          clearTimeout(timer);
          if (chrome.runtime?.lastError) {
            logger.debug(
              "[icon-ext] sendMessage failed",
              type,
              chrome.runtime.lastError.message,
            );
            finish(null);
            return;
          }
          if (response?.success && response.iconDataUrl) {
            finish({
              url: response.iconDataUrl,
              source: `ext:${response.source ?? "unknown"}`,
              size: response.size,
            });
            return;
          }
          finish(null);
        },
      );
    } catch (err) {
      clearTimeout(timer);
      logger.debug("[icon-ext] threw", type, err);
      finish(null);
    }
  });
}

/**
 * Static, fast path. Asks the extension's background worker to scrape
 * the target page over plain HTTP and return the best icon as a `data:`
 * URL. Returns `null` outside the extension or on any failure.
 */
export function extractIconViaBackground(pageUrl: string): Promise<ExtractedIcon | null> {
  return sendMessage("EXTRACT_ICON", pageUrl, FAST_TIMEOUT_MS);
}

/**
 * Deep, hidden-tab path. The extension opens the page in a minimized
 * background window, lets it fully render with cookies and JavaScript,
 * reads the live DOM, downloads the best candidate, and closes the
 * tab. Strictly more reliable than any other extraction strategy for
 * SPAs and authenticated sites.
 *
 * Costs an extra ~5–10s per first-time host. The result is then
 * persisted forever as a `data:` URL in IndexedDB.
 */
export function extractIconViaHiddenTab(pageUrl: string): Promise<ExtractedIcon | null> {
  return sendMessage("EXTRACT_ICON_DEEP", pageUrl, DEEP_TIMEOUT_MS);
}
