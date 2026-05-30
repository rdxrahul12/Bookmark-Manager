/**
 * HTML / manifest scraping (Tier 2).
 *
 * The single most powerful upgrade vs. a pure public-service approach:
 * actually read the page's `<link rel="icon">`, `<link rel="apple-touch-icon">`,
 * `<link rel="mask-icon">`, `<meta property="og:image">`, and `<link
 * rel="manifest">` declarations to discover icons declared by the site
 * itself.
 *
 * This is the *only* reliable way to resolve icons for:
 *   • Google subdomains (calendar/keep/classroom/docs/drive — they declare
 *     real product-specific icons, just not at predictable paths)
 *   • Modern PWAs that declare icons in `manifest.json`
 *   • Sites whose icons live behind cache-busted, versioned URLs
 *
 * Because cross-origin `fetch()` is blocked by CORS, we route through a
 * rotating set of CORS proxies. The HTML response is parsed with
 * `DOMParser` rather than regex so we get the same fidelity as a browser.
 */

import { logger } from "@/lib/logger";
import { fetchHtmlViaProxy, fetchTextViaProxy } from "./proxies";
import type { IconCandidate, IconFormat } from "./types";
import { inferFormat } from "./probe";

// Limit on declared sizes attribute parsing.
function parseSizesAttr(value: string | null): number {
  if (!value) return 0;
  const lower = value.toLowerCase();
  if (lower.includes("any")) return 1024; // SVG-ish "any" — treat as huge
  let max = 0;
  for (const m of lower.matchAll(/(\d+)\s*x\s*(\d+)/g)) {
    const w = parseInt(m[1], 10);
    if (!Number.isNaN(w) && w > max) max = w;
  }
  return max;
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Map a `<link rel>` token to a base score weight. */
function relWeight(rel: string): number {
  const r = rel.toLowerCase();
  if (r.includes("apple-touch-icon")) return 92;
  if (r.includes("mask-icon")) return 90;
  if (r === "icon" || r === "shortcut icon") return 80;
  if (r.includes("fluid-icon")) return 78;
  return 60;
}

/**
 * Scrapes the page HTML for icon declarations and returns probe-ready
 * candidates. Returns `[]` on any failure — the engine falls back to other
 * tiers gracefully.
 */
export async function scrapeHtmlIcons(
  pageUrl: string,
  signal?: AbortSignal,
): Promise<IconCandidate[]> {
  const fetched = await fetchHtmlViaProxy(pageUrl, signal);
  if (!fetched) return [];

  const candidates: IconCandidate[] = [];
  const baseUrl = fetched.finalUrl || pageUrl;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(fetched.text, "text/html");
  } catch (err) {
    logger.debug("[icon-scrape] parse failed", err);
    return [];
  }

  // Honour explicit <base href>
  const baseEl = doc.querySelector("base[href]");
  const effectiveBase = baseEl?.getAttribute("href")
    ? resolveUrl(baseEl.getAttribute("href")!, baseUrl) ?? baseUrl
    : baseUrl;

  // ── <link rel="..."> ───────────────────────────────────────────────
  const links = doc.querySelectorAll("link[rel]");
  for (const link of Array.from(links)) {
    const rel = link.getAttribute("rel") ?? "";
    const href = link.getAttribute("href");
    if (!href) continue;

    const lowerRel = rel.toLowerCase();
    const isIconish =
      lowerRel.includes("icon") ||
      lowerRel.includes("mask-icon") ||
      lowerRel.includes("fluid-icon");
    if (!isIconish) continue;

    const resolved = resolveUrl(href, effectiveBase);
    if (!resolved) continue;

    const declaredSize = parseSizesAttr(link.getAttribute("sizes"));
    const typeAttr = (link.getAttribute("type") ?? "").toLowerCase();
    let format: IconFormat | undefined = undefined;
    if (typeAttr.includes("svg")) format = "svg";
    else if (typeAttr.includes("png")) format = "png";
    else if (typeAttr.includes("ico") || typeAttr.includes("icon")) format = "ico";

    candidates.push({
      url: resolved,
      source: `html:${lowerRel}${declaredSize ? `:${declaredSize}` : ""}`,
      weight: relWeight(lowerRel),
      declaredSize: declaredSize || undefined,
      format: format ?? inferFormat(resolved),
      tier: 2,
    });
  }

  // ── <meta property="og:image"> / <meta name="twitter:image"> ──────
  // Open Graph images are typically large brand visuals — great fallbacks
  // when no real favicon is declared.
  const ogSelectors = [
    'meta[property="og:image"]',
    'meta[property="og:image:url"]',
    'meta[property="og:image:secure_url"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
  ];
  for (const sel of ogSelectors) {
    const m = doc.querySelector(sel);
    const content = m?.getAttribute("content");
    if (!content) continue;
    const resolved = resolveUrl(content, effectiveBase);
    if (!resolved) continue;
    candidates.push({
      url: resolved,
      source: `html:${sel.replace(/[[\]]/g, "")}`,
      weight: 70,
      tier: 2,
    });
  }

  // ── <meta name="msapplication-TileImage"> ──
  const tile = doc.querySelector('meta[name="msapplication-TileImage"]');
  const tileContent = tile?.getAttribute("content");
  if (tileContent) {
    const resolved = resolveUrl(tileContent, effectiveBase);
    if (resolved) {
      candidates.push({
        url: resolved,
        source: "html:msapp-tile",
        weight: 78,
        tier: 2,
      });
    }
  }

  // ── manifest.json — PWA icons ──
  // Modern apps almost always declare 192×192 and 512×512 PWA icons here,
  // and the file is tiny, so this is a high-yield request.
  const manifestEl = doc.querySelector('link[rel~="manifest"]');
  const manifestHref = manifestEl?.getAttribute("href");
  if (manifestHref) {
    const manifestUrl = resolveUrl(manifestHref, effectiveBase);
    if (manifestUrl) {
      try {
        const manifestText = await fetchTextViaProxy(manifestUrl, signal);
        if (manifestText) {
          // BOM strip
          const cleaned = manifestText.replace(/^\uFEFF/, "").trim();
          const manifest = JSON.parse(cleaned) as {
            icons?: Array<{
              src?: string;
              sizes?: string;
              type?: string;
              purpose?: string;
            }>;
          };
          if (Array.isArray(manifest.icons)) {
            for (const icon of manifest.icons) {
              if (!icon.src) continue;
              const resolvedIcon = resolveUrl(icon.src, manifestUrl);
              if (!resolvedIcon) continue;
              const size = parseSizesAttr(icon.sizes ?? null);
              const purpose = (icon.purpose ?? "").toLowerCase();
              // "maskable" icons have padding but are usually high-quality.
              // Don't reject; small de-rank if "monochrome" only.
              const purposeBoost = purpose.includes("monochrome") ? -10 : 0;
              candidates.push({
                url: resolvedIcon,
                source: `manifest${size ? `:${size}` : ""}${purpose ? ":" + purpose : ""}`,
                weight: 88 + purposeBoost,
                declaredSize: size || undefined,
                format: icon.type?.includes("svg")
                  ? "svg"
                  : icon.type?.includes("png")
                    ? "png"
                    : inferFormat(resolvedIcon),
                tier: 2,
              });
            }
          }
        }
      } catch (err) {
        logger.debug("[icon-scrape] manifest parse failed", err);
      }
    }
  }

  return candidates;
}
