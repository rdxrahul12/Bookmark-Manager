/**
 * Best-icon → `data:` URL persistence — heavy reliability edition.
 *
 * The single biggest source of icon flicker in the previous engine: a
 * cached *remote* URL means every render re-fetches, and any transient
 * 5xx / rate-limit fires `<img onError>` and bumps us back to the
 * fallback ladder. The fix is to convert the winning icon to a
 * self-contained `data:` URL and store *that* in the cache.
 *
 * Strategy (try every method, take the first success):
 *
 *   1. **Direct fetch** — works for the (rare) origins that allow CORS.
 *   2. **Canvas re-render** — works when image-level CORS is permitted
 *      even if fetch isn't. Normalizes raster format to PNG.
 *   3. **Proxy blob fetch** — walks the entire 10-proxy pool until one
 *      returns the binary. Always works for any reachable URL.
 *
 * For SVG specifically we always try to inline the markup (smaller and
 * pixel-perfect at any size). For raster we prefer canvas re-render
 * because it normalizes 1MB+ apple-touch icons to a sensible 256-px PNG.
 *
 * Returns the original URL only if every strategy failed across the
 * entire proxy fleet — extremely rare.
 */

import { logger } from "@/lib/logger";
import { fetchBlobViaProxy, fetchTextViaProxy } from "./proxies";

const TARGET_SIZE = 256;
/** Max persisted data URL ~250KB. Saves IndexedDB space and rendering cost. */
const MAX_DATA_URL_BYTES = 250 * 1024;

const FETCH_TIMEOUT_MS = 12_000;
const IMG_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, {
      signal: ac.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { Accept: "image/*,*/*;q=0.8" },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    if (blob.size === 0) return resolve(null);
    if (blob.size > MAX_DATA_URL_BYTES * 4) {
      // Way too big — let canvas re-render shrink it instead.
      return resolve(null);
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) return resolve(null);
      // Patch generic mime types so the browser actually decodes them.
      if (result.startsWith("data:application/octet-stream")) {
        return resolve(result.replace("application/octet-stream", "image/x-icon"));
      }
      // Some proxies strip Content-Type; FileReader emits empty mime.
      if (result.startsWith("data:;base64,")) {
        return resolve(result.replace("data:;base64,", "data:image/png;base64,"));
      }
      resolve(result);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function isImageContentType(ct: string): boolean {
  if (!ct) return false;
  const lower = ct.toLowerCase();
  return (
    lower.startsWith("image/") ||
    lower.includes("icon") ||
    lower.includes("octet-stream")
  );
}

function looksLikeImage(blob: Blob): boolean {
  if (blob.size < 100) return false;
  const t = (blob.type || "").toLowerCase();
  if (isImageContentType(t)) return true;
  if (t.includes("text/html") || t.includes("application/json")) return false;
  if (t.startsWith("text/")) return false;
  return true;
}

/** Direct fetch — works only when the origin sends ACAO. */
async function tryDirectFetch(url: string): Promise<string | null> {
  const r = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  if (!r || !r.ok) return null;
  let blob: Blob;
  try {
    blob = await r.blob();
  } catch {
    return null;
  }
  if (!looksLikeImage(blob)) return null;
  // Pass through the canvas pipeline for raster — it shrinks and normalizes.
  if ((blob.type || "").includes("svg")) {
    const text = await blob.text();
    if (text.includes("<svg")) return svgTextToDataUrl(text);
  }
  // Try canvas first (smaller PNG output); fall back to direct base64.
  const rendered = await rasterizeBlobToDataUrl(blob);
  if (rendered) return rendered;
  return blobToDataUrl(blob);
}

/** Canvas re-render — works when image-level CORS is permitted. */
function tryCanvasRender(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (v: string | null) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      resolve(v);
    };
    const t = setTimeout(() => finish(null), IMG_TIMEOUT_MS);
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.decoding = "async";
    img.onload = () => {
      clearTimeout(t);
      try {
        const dataUrl = renderImageToDataUrl(img);
        finish(dataUrl);
      } catch (err) {
        logger.debug("[icon-persist] canvas tainted", err);
        finish(null);
      }
    };
    img.onerror = () => {
      clearTimeout(t);
      finish(null);
    };
    img.src = url;
  });
}

/** Proxy fetch — last resort. Walks the full proxy pool. */
async function tryProxyFetch(url: string): Promise<string | null> {
  const r = await fetchBlobViaProxy(url);
  if (!r) return null;
  // Try canvas pipeline first (handles ICO better than naive base64)
  const blob = r.blob;
  if ((blob.type || "").includes("svg")) {
    const text = await blob.text();
    if (text.includes("<svg")) return svgTextToDataUrl(text);
  }
  const rendered = await rasterizeBlobToDataUrl(blob);
  if (rendered) return rendered;
  return blobToDataUrl(blob);
}

/**
 * Render an Image element to a 256×256 PNG data URL.
 * Throws if the canvas is tainted (caller catches).
 */
function renderImageToDataUrl(img: HTMLImageElement): string | null {
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  if (srcW === 0 || srcH === 0) return null;
  const scale = Math.min(TARGET_SIZE / srcW, TARGET_SIZE / srcH, 1);
  const drawW = Math.round(srcW * scale);
  const drawH = Math.round(srcH * scale);
  const dx = Math.round((TARGET_SIZE - drawW) / 2);
  const dy = Math.round((TARGET_SIZE - drawH) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, dx, dy, drawW, drawH);
  const dataUrl = canvas.toDataURL("image/png");
  if (dataUrl.length > MAX_DATA_URL_BYTES * 1.4) return null;
  return dataUrl;
}

/**
 * Decode a Blob into an Image (via blob URL) and render to a 256-px PNG.
 * The Image is loaded with no `crossOrigin` flag because the data is
 * already same-origin (it's a blob: URL we created), so canvas reads
 * always succeed.
 */
function rasterizeBlobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const blobUrl = URL.createObjectURL(blob);
    const img = new Image();
    let settled = false;
    const finish = (v: string | null) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      URL.revokeObjectURL(blobUrl);
      resolve(v);
    };
    const t = setTimeout(() => finish(null), IMG_TIMEOUT_MS);
    img.decoding = "async";
    img.onload = () => {
      clearTimeout(t);
      try {
        const dataUrl = renderImageToDataUrl(img);
        finish(dataUrl);
      } catch (err) {
        logger.debug("[icon-persist] blob rasterize failed", err);
        finish(null);
      }
    };
    img.onerror = () => {
      clearTimeout(t);
      finish(null);
    };
    img.src = blobUrl;
  });
}

/** SVG-specific: inline as base64 SVG data URL. */
async function tryPersistSvg(url: string): Promise<string | null> {
  const r = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  if (r && r.ok) {
    try {
      const text = await r.text();
      if (text.includes("<svg")) return svgTextToDataUrl(text);
    } catch {
      /* fall through */
    }
  }
  const proxied = await fetchTextViaProxy(url);
  if (proxied && proxied.includes("<svg")) return svgTextToDataUrl(proxied);
  return null;
}

function svgTextToDataUrl(svgText: string): string | null {
  try {
    if (svgText.length > MAX_DATA_URL_BYTES) return null;
    const utf8 = unescape(encodeURIComponent(svgText));
    const base64 = btoa(utf8);
    return `data:image/svg+xml;base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * Best-effort conversion of a remote icon URL to a `data:` URL.
 *
 * Tries every available strategy serially until one succeeds. Returns
 * the original URL only if all strategies failed across every proxy.
 */
export async function persistAsDataUrl(remoteUrl: string): Promise<string> {
  if (remoteUrl.startsWith("data:")) return remoteUrl;

  const lower = remoteUrl.toLowerCase().split(/[?#]/)[0];

  // SVG path — keep as SVG when available.
  if (lower.endsWith(".svg")) {
    const svg = await tryPersistSvg(remoteUrl);
    if (svg) return svg;
    // If SVG-specific failed, fall through to generic strategies.
  }

  // 1. Direct fetch
  const direct = await tryDirectFetch(remoteUrl);
  if (direct) return direct;

  // 2. Canvas re-render via crossOrigin <img>
  const rendered = await tryCanvasRender(remoteUrl);
  if (rendered) return rendered;

  // 3. Proxy fetch — always works for any reachable URL
  const proxied = await tryProxyFetch(remoteUrl);
  if (proxied) return proxied;

  return remoteUrl;
}
