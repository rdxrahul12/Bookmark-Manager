/**
 * Image probing.
 *
 * Loads an image URL via `new Image()` (CORS-free; we never read pixels)
 * and resolves with its natural dimensions on success, or `null` on
 * failure. Never rejects — callers can use `Promise.all` safely.
 *
 * Timeout is generous (10s) because the engine's reliability budget
 * tolerates slow CDNs. The user only ever pays this once per host since
 * the result gets persisted as a `data:` URL.
 */

import type { ProbeSuccess, IconFormat } from "./types";

const PROBE_TIMEOUT_MS = 10_000;

export function inferFormat(url: string): IconFormat {
  const lower = url.toLowerCase().split(/[?#]/)[0];
  if (lower.endsWith(".svg")) return "svg";
  if (lower.endsWith(".png")) return "png";
  if (lower.endsWith(".ico")) return "ico";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg";
  if (lower.endsWith(".webp")) return "webp";
  if (lower.endsWith(".gif")) return "gif";
  if (lower.startsWith("data:image/svg")) return "svg";
  if (lower.startsWith("data:image/png")) return "png";
  if (lower.startsWith("data:image/jpeg")) return "jpg";
  if (lower.startsWith("data:image/webp")) return "webp";
  return "unknown";
}

/**
 * Probes an image URL. Resolves with dimensions on success, `null`
 * otherwise. Always honours an external `signal`.
 */
export function probeImage(
  url: string,
  signal?: AbortSignal,
): Promise<ProbeSuccess | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }
    const img = new Image();
    let settled = false;

    const finish = (value: ProbeSuccess | null) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      try {
        img.src = "";
      } catch {
        /* noop */
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);
    const onAbort = () => finish(null);
    signal?.addEventListener("abort", onAbort, { once: true });

    img.onload = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        finish(null);
        return;
      }
      finish({
        url,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        format: inferFormat(url),
      });
    };

    img.onerror = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      finish(null);
    };

    img.referrerPolicy = "no-referrer";
    img.decoding = "async";
    img.src = url;
  });
}
