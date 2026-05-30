/**
 * Quality scoring for resolved icon candidates.
 *
 *   score = sourceWeight + dimScore + formatBonus
 *           − genericPenalty − aspectPenalty − tier3Penalty
 *
 * Higher is better. Caller picks the highest-scoring result across the
 * entire candidate space.
 *
 * The previous version of this scorer leaned too heavily on
 * `sourceWeight` and would let a 32×32 placeholder from a generic
 * service (Google s2 returning the colored "G" for `keep.google.com`)
 * outscore a real 256×256 icon from icon.horse. The current weights
 * make dimension dominate beyond ~96px so a real, large icon always
 * wins regardless of which service produced it.
 */

import type { IconCandidate, IconFormat, ProbeSuccess } from "./types";

/**
 * Generic-placeholder fingerprints. Public services return these
 * dimensions when they have nothing real to give. We penalize heavily
 * because they're indistinguishable from real small favicons except by
 * source.
 */
const GENERIC_DIMS = new Set<string>(["16x16", "32x32"]);

/** Sources that are known to return generic placeholders. */
const PLACEHOLDER_SOURCES = new Set<string>([
  "google-s2-256",
  "google-s2-128",
  "google-s2-64",
  "google-fav-by-url",
  "duckduckgo",
  "yandex",
  "statvoo",
  "apex:google-s2-256",
  "apex:duckduckgo",
]);

function dimScore(w: number, h: number): number {
  const s = Math.min(w, h);
  if (s >= 512) return 280;
  if (s >= 384) return 250;
  if (s >= 256) return 230;
  if (s >= 192) return 200;
  if (s >= 144) return 175;
  if (s >= 128) return 160;
  if (s >= 96) return 130;
  if (s >= 64) return 100;
  if (s >= 48) return 70;
  if (s >= 32) return 40;
  if (s >= 16) return 15;
  return 5;
}

function formatBonus(format?: IconFormat): number {
  if (format === "svg") return 35;
  if (format === "png") return 15;
  if (format === "webp") return 10;
  if (format === "ico") return 0;
  if (format === "gif") return -10;
  if (format === "jpg" || format === "jpeg") return -5;
  return 0;
}

/** Penalty for non-square / wildly-rectangular images (likely banners/og). */
function aspectPenalty(w: number, h: number): number {
  if (w === 0 || h === 0) return 60;
  const ratio = Math.max(w, h) / Math.min(w, h);
  if (ratio <= 1.05) return 0;
  if (ratio <= 1.25) return 5;
  if (ratio <= 1.5) return 15;
  if (ratio <= 2.0) return 35;
  return 80;
}

export function scoreResult(c: IconCandidate, p: ProbeSuccess): number {
  let score = c.weight + dimScore(p.naturalWidth, p.naturalHeight);
  score += formatBonus(p.format ?? c.format);
  score -= aspectPenalty(p.naturalWidth, p.naturalHeight);

  // Generic-placeholder penalty
  const dimKey = `${p.naturalWidth}x${p.naturalHeight}`;
  if (GENERIC_DIMS.has(dimKey) && PLACEHOLDER_SOURCES.has(c.source)) {
    score -= 120;
  }

  // Tier 3 (apex fallback) is intrinsically slightly less precise.
  if (c.tier === 3) score -= 12;

  return Math.max(0, Math.round(score));
}
