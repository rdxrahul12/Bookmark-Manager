/**
 * Icon engine — public entry point.
 *
 * Resolves the highest-quality favicon for any URL by orchestrating four
 * tiers concurrently:
 *
 *   Tier 0 — Persistent cache (IndexedDB). Returned immediately when warm.
 *            Cached results that aren't `data:` URLs get re-resolved in the
 *            background to upgrade to durable storage.
 *
 *   Tier 1 — Fast public services + curated overrides + site-hosted paths.
 *            ~80–100 candidates probed *all in parallel* — no concurrency
 *            limits. The user only ever pays this cost once per host
 *            because the winner is persisted as a `data:` URL.
 *
 *   Tier 2 — HTML / manifest scraping via deep CORS-proxy rotation. We try
 *            both the original URL AND its `www.` variant AND the apex
 *            domain so subdomain-only icons surface even when the user
 *            bookmarked an apex URL. Each attempt walks the entire proxy
 *            pool until something works.
 *
 *   Tier 3 — Apex fallback. ~30 more candidates against the apex domain.
 *
 * Design principle: **reliability over speed**. The engine doesn't bail
 * early; it waits for every tier to settle, scores all results together,
 * and returns the absolute best. The first time a user adds a bookmark,
 * the resolve may take 5–15 seconds; every subsequent render hits the
 * IndexedDB-stored data URL in <1ms.
 */

import { logger } from "@/lib/logger";
import { iconCache } from "./cache";
import { probeImage } from "./probe";
import {
  buildFastCandidates,
  buildApexFallbackCandidates,
  getApexDomain,
} from "./sources";
import { buildExtraCandidates } from "./extraSources";
import { scrapeHtmlIcons } from "./scrape";
import { scoreResult } from "./scoring";
import { persistAsDataUrl } from "./persist";
import { extractIconViaBackground, extractIconViaHiddenTab } from "./extension";
import { getOverrideCandidates } from "./overrides";
import { iconGallery } from "./gallery";
import type { IconCandidate, IconResult, ResolveOptions } from "./types";

export type { IconResult, ResolveOptions } from "./types";
export { iconGallery, galleryKeyFor } from "./gallery";
export type { GalleryEntry } from "./gallery";
export { makeAvatarDataUrl } from "./avatar";

function getHostnameKey(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function tryGetUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

/**
 * Probes a list of candidates entirely in parallel. Honours cancellation
 * via the optional signal. Calls `onResult` for every successful probe so
 * the caller can stream progressive UI updates.
 */
async function probeAll(
  candidates: IconCandidate[],
  onResult: (c: IconCandidate, score: number, w: number, h: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  await Promise.allSettled(
    candidates.map(async (c) => {
      if (signal?.aborted) return;
      const probe = await probeImage(c.url, signal);
      if (!probe) return;
      const score = scoreResult(c, probe);
      onResult(c, score, probe.naturalWidth, probe.naturalHeight);
    }),
  );
}
/** Build all the URL variants we want to scrape — original, www-flipped, and apex. */
function buildScrapeTargets(rawUrl: string): string[] {
  const parsed = tryGetUrl(rawUrl);
  if (!parsed) return [];
  const targets = new Set<string>();
  targets.add(parsed.toString());

  const host = parsed.hostname;
  // www <-> bare flip
  if (host.startsWith("www.")) {
    const bare = parsed.toString().replace(`//www.${host.slice(4)}`, `//${host.slice(4)}`);
    targets.add(bare);
  } else {
    const wwwed = parsed.toString().replace(`//${host}`, `//www.${host}`);
    targets.add(wwwed);
  }
  // apex
  const apex = getApexDomain(host.replace(/^www\./, ""));
  if (apex && apex !== host && apex !== host.replace(/^www\./, "")) {
    targets.add(`https://${apex}/`);
    targets.add(`https://www.${apex}/`);
  }
  return Array.from(targets);
}

/**
 * Resolve the best favicon for a URL. Always resolves — never throws.
 *
 * @returns The winner, or `null` if every probe failed (caller should
 *          render a fallback avatar).
 */
export async function resolveBestIcon(
  pageUrl: string,
  opts: ResolveOptions = {},
): Promise<IconResult | null> {
  const host = getHostnameKey(pageUrl);
  if (!host) return null;

  const onProgress = opts.onProgress ?? (() => undefined);
  const persist = opts.persist ?? true;
  const externalSignal = opts.signal;

  // ── Tier 0 — cache ───────────────────────────────────────────────────
  if (!opts.forceRefresh) {
    const cached = await iconCache.get(host);
    if (cached !== undefined) {
      if (cached) {
        const hit: IconResult = { ...cached, cached: true };
        onProgress(hit);
        // Seed the gallery with the cached winner so Settings → Site
        // Icons can render at least one option without forcing a
        // refresh. Idempotent — if it's already recorded, the gallery
        // upserts silently.
        void iconGallery.record(host, {
          url: hit.url,
          source: hit.source,
          width: hit.width,
          height: hit.height,
          score: hit.score,
          capturedAt: Date.now(),
        });
        // If the cached entry isn't a `data:` URL, kick off a background
        // upgrade so the next render is fully durable. Don't await.
        if (!hit.url.startsWith("data:") && persist) {
          void upgradeToDataUrl(host, hit);
        }
        return hit;
      }
      return null; // cached miss — caller renders avatar
    }
  } else {
    await iconCache.invalidate(host);
  }

  // Track best across all tiers.
  let best: IconResult | null = null;

  const consider = (c: IconCandidate, w: number, h: number, score: number, urlOverride?: string): void => {
    const result: IconResult = {
      url: urlOverride ?? c.url,
      source: c.source,
      width: w,
      height: h,
      score,
      cached: false,
      format: c.format,
    };
    // Capture in the gallery so Settings → Site Icons can show every
    // probed candidate, not just the winner. Fire-and-forget — failures
    // never affect resolver behaviour.
    void iconGallery.record(host, {
      url: result.url,
      source: result.source,
      width: result.width,
      height: result.height,
      score: result.score,
      capturedAt: Date.now(),
    });
    if (!best || result.score > best.score) {
      best = result;
      onProgress(result);
    }
  };

  // ── Extension bridges ────────────────────────────────────────────────
  // Two extension paths run in parallel with everything else:
  //   • Fast: static fetch + HTML parse, baseline score 360.
  //   • Deep: hidden-tab live-DOM harvest, baseline score 460 — the
  //     definitive answer when it succeeds, slower but rarely loses.
  const extPromise = extractIconViaBackground(pageUrl)
    .then((ext) => {
      if (!ext) return;
      const result: IconResult = {
        url: ext.url,
        source: ext.source,
        width: ext.size ?? 256,
        height: ext.size ?? 256,
        score: 360,
        cached: false,
      };
      void iconGallery.record(host, {
        url: result.url,
        source: result.source,
        width: result.width,
        height: result.height,
        score: result.score,
        capturedAt: Date.now(),
      });
      if (!best || result.score > best.score) {
        best = result;
        onProgress(result);
      }
    })
    .catch(() => undefined);

  const deepPromise = extractIconViaHiddenTab(pageUrl)
    .then((ext) => {
      if (!ext) return;
      const result: IconResult = {
        url: ext.url,
        source: ext.source,
        width: ext.size ?? 256,
        height: ext.size ?? 256,
        // Deep harvest reads the actual live DOM with cookies — strictly
        // more reliable than every other strategy. Score it accordingly.
        score: 460,
        cached: false,
      };
      void iconGallery.record(host, {
        url: result.url,
        source: result.source,
        width: result.width,
        height: result.height,
        score: result.score,
        capturedAt: Date.now(),
      });
      if (!best || result.score > best.score) {
        best = result;
        onProgress(result);
      }
    })
    .catch(() => undefined);

  // ── Tier 1 — overrides + fast public + site-hosted ───────────────────
  // If we have a curated override for this host, that IS the right
  // answer. We still race the rest of Tier 1 to validate the override
  // probably loads, but Tier 3 apex is skipped — apex would return the
  // generic Google G / Amazon smile, which would be wrong for a
  // subdomain product page.
  const overrides = getOverrideCandidates(pageUrl);
  const hasOverride = overrides.length > 0;
  const tier1Candidates: IconCandidate[] = [
    ...overrides,
    ...buildFastCandidates(pageUrl),
  ];
  const tier1Probed = new Set(tier1Candidates.map((c) => c.url));

  const tier1 = probeAll(
    tier1Candidates,
    (c, score, w, h) => consider(c, w, h, score),
    externalSignal,
  );

  // ── Tier 2 — HTML/manifest scraping across multiple URL variants ─────
  // We try the original URL, its www-flip, and the apex — the page's
  // <link rel="icon"> declarations might only exist on one of them.
  const scrapeTargets = buildScrapeTargets(pageUrl);
  const tier2 = (async () => {
    // Run scrape for every target in parallel; merge candidates.
    const scrapedPerTarget = await Promise.all(
      scrapeTargets.map((t) => scrapeHtmlIcons(t, externalSignal).catch(() => [])),
    );
    const all = scrapedPerTarget.flat();
    // Dedup — only candidates we haven't already probed.
    const seen = new Set<string>(tier1Probed);
    const fresh: IconCandidate[] = [];
    for (const c of all) {
      if (seen.has(c.url)) continue;
      seen.add(c.url);
      fresh.push(c);
    }
    if (fresh.length === 0) return;
    await probeAll(
      fresh,
      (c, score, w, h) => consider(c, w, h, score),
      externalSignal,
    );
  })();

  // ── Tier 3 — apex fallback ───────────────────────────────────────────
  // Skipped when an override matched: the apex would just return the
  // generic parent-brand icon (Google G for `keep.google.com`, Amazon
  // smile for `aws.amazon.com`), which is exactly what we're trying to
  // override away from.
  const tier3Candidates = hasOverride ? [] : buildApexFallbackCandidates(pageUrl);
  const tier3Probed = tier3Candidates.filter((c) => !tier1Probed.has(c.url));
  const tier3 = probeAll(
    tier3Probed,
    (c, score, w, h) => consider(c, w, h, score),
    externalSignal,
  );

  // ── Discovery — wide-net extra candidates ───────────────────────────
  // When the caller asks for `discover`, probe the full extra catalog
  // (~100 more URLs across every public CDN at every reasonable size,
  // every iOS apple-touch-icon size, common alternative paths). These
  // never affect winner selection — their weights are intentionally
  // lower than the main pipeline — but every successful probe is
  // recorded in the gallery so the customizer has the widest possible
  // set of choices.
  const tier4Candidates: IconCandidate[] = opts.discover
    ? buildExtraCandidates(pageUrl).filter((c) => !tier1Probed.has(c.url))
    : [];
  // Track these too so subsequent dedup (with scrape) doesn't re-probe.
  for (const c of tier4Candidates) tier1Probed.add(c.url);
  const tier4 = probeAll(
    tier4Candidates,
    (c, score, w, h) => consider(c, w, h, score),
    externalSignal,
  );

  await Promise.allSettled([tier1, extPromise, deepPromise, tier2, tier3, tier4]);

  if (!best) {
    await iconCache.set(host, null);
    return null;
  }

  // ── Persistence — convert winner to data URL ──
  const winner: IconResult = best;
  if (persist && !winner.url.startsWith("data:")) {
    try {
      const persistedUrl = await persistAsDataUrl(winner.url);
      if (persistedUrl !== winner.url) {
        winner.url = persistedUrl;
        winner.score += 5; // data URLs are intrinsically more durable
        onProgress({ ...winner });
      } else {
        // Persistence fully failed across every strategy. Cache the
        // remote URL with a shorter TTL so we'll retry sooner.
        logger.debug("[icon-engine] could not persist as data URL", winner.url);
      }
    } catch (err) {
      logger.debug("[icon-engine] persist failed", err);
    }
  }

  await iconCache.set(host, winner);
  return winner;
}

/**
 * Background upgrade for cached entries that haven't been persisted as
 * data URLs yet. Re-runs persistence and overwrites the cache record,
 * with no UI side effects beyond the next render being faster.
 */
async function upgradeToDataUrl(host: string, current: IconResult): Promise<void> {
  try {
    const persisted = await persistAsDataUrl(current.url);
    if (persisted !== current.url && persisted.startsWith("data:")) {
      const upgraded: IconResult = {
        ...current,
        url: persisted,
        cached: false,
        score: current.score + 5,
      };
      await iconCache.set(host, upgraded);
    }
  } catch (err) {
    logger.debug("[icon-engine] background upgrade failed", err);
  }
}

/**
 * Pre-warm the cache for a URL. Used when a bookmark is added so the
 * icon is ready before the card actually mounts. Fire-and-forget.
 */
export function prefetchIcon(pageUrl: string): void {
  if (!pageUrl) return;
  resolveBestIcon(pageUrl).catch(() => undefined);
}
