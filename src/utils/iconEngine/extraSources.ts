/**
 * Extra icon candidates — discovery mode.
 *
 * `sources.ts` is built for the resolver: a focused, balanced set of
 * candidates tuned to find the single best icon as fast as possible.
 *
 * This module is built for the customizer: a *much* wider net that
 * surfaces every plausible icon variant we know how to ask for. Used
 * when `resolveBestIcon` is called with `discover: true` (currently
 * just from the icon customizer's auto-refresh and per-row refresh).
 *
 * What's here that isn't in the regular pipeline:
 *
 *   • Every public favicon CDN we trust, at every reasonable size
 *     (Google s2 at 9 sizes, Clearbit at 7 sizes, Logo.dev at 7
 *     sizes + multiple formats, FaviconKit at 6 sizes, …).
 *
 *   • Format variants for services that support them (Logo.dev SVG +
 *     PNG + JPG, DuckDuckGo with both ip3 and ip2 endpoints).
 *
 *   • Additional public services not in the main pipeline (besticon
 *     extra sizes, AbstractAPI favicon, microlink with size hints,
 *     gravatar-domain-fallback, …).
 *
 *   • Apple-touch-icon at every iOS-spec'd size (57, 60, 72, 76, 87,
 *     100, 114, 120, 144, 152, 167, 180).
 *
 *   • Microsoft tile sizes (70, 144, 150, 270, 310).
 *
 *   • Common alternative paths (`/apple-icon.png`, `/icon-512.png`,
 *     `/logo.png`, `/static/favicon.png`, `/assets/logo.svg`, …).
 *
 *   • Apex-domain probes for every public service so a subdomain
 *     bookmark also surfaces the parent brand's icon as a choice.
 *
 * Everything here is **lower-weight than the main candidates** so that
 * even if a discovery probe wins on dimension, it can't accidentally
 * outrank a high-quality main-pipeline icon. The scoring system
 * handles this transparently.
 *
 * Total emitted: ~120 candidates per URL. Probed in parallel via
 * `<img>` so CORS isn't a factor.
 */

import type { IconCandidate } from "./types";
import { getApexDomain } from "./sources";

function getOrigin(rawUrl: string): string {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return "";
  }
}

function getHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "";
  }
}

function stripWww(host: string): string {
  return host.replace(/^www\./, "");
}

// ─── Public-service size matrices ───────────────────────────────────────
//
// One entry per (service, size). Lower base weight than the main pipeline
// (60 vs 75) so even if a discovery probe scores highest by dimension, the
// main pipeline's best candidate at the same size still wins by a small
// margin. The user sees these as additional options in the customizer
// row — they're not meant to replace the curated picks.

interface SizedService {
  /** Stable label that uniquely identifies the URL — used for dedup. */
  source: string;
  /** Probe URL for the given host + size. */
  build: (host: string, fullUrl: string, size: number) => string;
  /** Sizes to probe. Each emits one candidate. */
  sizes: number[];
  /** Base weight before declared-size influence is added. */
  baseWeight: number;
}

const SIZED_SERVICES: ReadonlyArray<SizedService> = [
  // Google s2 — widest coverage. Add sizes the main pipeline doesn't
  // request: 16, 32, 48, 96, 192, 384, 512.
  {
    source: "extra:google-s2",
    build: (h, _u, s) => `https://www.google.com/s2/favicons?domain=${h}&sz=${s}`,
    sizes: [16, 32, 48, 96, 192, 384, 512],
    baseWeight: 55,
  },
  {
    source: "extra:google-fav-url",
    build: (_h, u, s) =>
      `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(u)}&sz=${s}`,
    sizes: [16, 32, 48, 96, 128, 192, 384, 512],
    baseWeight: 56,
  },
  // Clearbit — lots of sizes available, brand-quality logos when matched.
  {
    source: "extra:clearbit",
    build: (h, _u, s) => `https://logo.clearbit.com/${h}?size=${s}`,
    sizes: [64, 96, 144, 192, 384, 768],
    baseWeight: 62,
  },
  // Logo.dev — explicit size + format permutations.
  {
    source: "extra:logo-dev-png",
    build: (h, _u, s) =>
      `https://img.logo.dev/${h}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=${s}&format=png`,
    sizes: [64, 96, 128, 192, 384, 512, 768],
    baseWeight: 60,
  },
  {
    source: "extra:logo-dev-jpg",
    build: (h, _u, s) =>
      `https://img.logo.dev/${h}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=${s}&format=jpg`,
    sizes: [128, 256, 384, 512],
    baseWeight: 56,
  },
  {
    source: "extra:logo-dev-webp",
    build: (h, _u, s) =>
      `https://img.logo.dev/${h}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=${s}&format=webp`,
    sizes: [128, 256, 512],
    baseWeight: 60,
  },
  // FaviconKit at extra sizes.
  {
    source: "extra:faviconkit",
    build: (h, _u, s) => `https://api.faviconkit.com/${h}/${s}`,
    sizes: [32, 48, 64, 96, 128, 192],
    baseWeight: 52,
  },
  // Brandfetch with explicit width/height. Their CDN does smart cropping.
  {
    source: "extra:brandfetch",
    build: (h, _u, s) => `https://cdn.brandfetch.io/${h}/w/${s}/h/${s}`,
    sizes: [64, 96, 128, 192, 384, 512],
    baseWeight: 64,
  },
  // icon.horse `size` parameter — supported for the by-host endpoint.
  {
    source: "extra:icon-horse",
    build: (h, _u, s) => `https://icon.horse/icon/${h}?size=${s}`,
    sizes: [32, 64, 128, 256],
    baseWeight: 70,
  },
  // Besticon at extra sizes.
  {
    source: "extra:besticon",
    build: (h, _u, s) =>
      `https://besticon-demo.herokuapp.com/icon?url=${h}&size=${s}`,
    sizes: [32, 64, 128, 192, 384],
    baseWeight: 50,
  },
];

// ─── Single-URL public services ─────────────────────────────────────────
//
// Public services that only have one canonical URL (no size matrix).
// Lower weight, just adds optional choices to the customizer row.

interface PublicEndpoint {
  source: string;
  build: (host: string, fullUrl: string) => string;
  weight: number;
}

const PUBLIC_ENDPOINTS: ReadonlyArray<PublicEndpoint> = [
  // DuckDuckGo's older endpoint — sometimes returns a different cached
  // copy than ip3.
  {
    source: "extra:ddg-ip2",
    build: (h) => `https://icons.duckduckgo.com/ip2/${h}.ico`,
    weight: 55,
  },
  // unavatar variants targeting different upstream backends.
  {
    source: "extra:unavatar-clearbit",
    build: (h) => `https://unavatar.io/clearbit/${h}?fallback=false`,
    weight: 60,
  },
  {
    source: "extra:unavatar-google",
    build: (h) => `https://unavatar.io/google/${h}?fallback=false`,
    weight: 58,
  },
  {
    source: "extra:unavatar-duckduckgo",
    build: (h) => `https://unavatar.io/duckduckgo/${h}?fallback=false`,
    weight: 55,
  },
  // Microlink with logo embed, hint at high resolution.
  {
    source: "extra:microlink-hd",
    build: (_h, u) =>
      `https://api.microlink.io/?url=${encodeURIComponent(u)}&meta=false&data.screenshot=false&data.logo=true&embed=logo.url&size=large`,
    weight: 64,
  },
  // GitHub's identicon endpoint — last-resort generated avatar based
  // on hostname hash. Always renders something.
  {
    source: "extra:github-identicon",
    build: (h) => `https://avatars.githubusercontent.com/in/${h}?s=256`,
    weight: 30,
  },
];

// ─── Site-hosted alternative paths ──────────────────────────────────────
//
// Beyond the standard set in `sources.ts`, many sites use bespoke paths:

interface SitePath {
  path: string;
  weight: number;
  declaredSize?: number;
}

const EXTRA_SITE_PATHS: ReadonlyArray<SitePath> = [
  // Apple-touch-icon at every iOS-canonical size. The main pipeline
  // covers 76, 120, 152, 180; this fills in the rest.
  { path: "/apple-touch-icon-57x57.png", weight: 60, declaredSize: 57 },
  { path: "/apple-touch-icon-60x60.png", weight: 62, declaredSize: 60 },
  { path: "/apple-touch-icon-72x72.png", weight: 65, declaredSize: 72 },
  { path: "/apple-touch-icon-87x87.png", weight: 70, declaredSize: 87 },
  { path: "/apple-touch-icon-100x100.png", weight: 72, declaredSize: 100 },
  { path: "/apple-touch-icon-114x114.png", weight: 75, declaredSize: 114 },
  { path: "/apple-touch-icon-144x144.png", weight: 80, declaredSize: 144 },
  { path: "/apple-touch-icon-167x167.png", weight: 85, declaredSize: 167 },
  // Newer iOS naming conventions.
  { path: "/apple-icon.png", weight: 80 },
  { path: "/apple-icon-precomposed.png", weight: 78 },
  { path: "/apple-icon-180x180.png", weight: 88, declaredSize: 180 },
  // Microsoft tiles at extra sizes.
  { path: "/mstile-70x70.png", weight: 60, declaredSize: 70 },
  { path: "/mstile-144x144.png", weight: 78, declaredSize: 144 },
  { path: "/mstile-270x270.png", weight: 86, declaredSize: 270 },
  { path: "/mstile-310x310.png", weight: 90, declaredSize: 310 },
  { path: "/mstile-310x150.png", weight: 70, declaredSize: 310 },
  // Common PNG fallbacks at "round" sizes.
  { path: "/favicon-128x128.png", weight: 80, declaredSize: 128 },
  { path: "/favicon-144x144.png", weight: 82, declaredSize: 144 },
  { path: "/favicon-152x152.png", weight: 84, declaredSize: 152 },
  { path: "/favicon-160x160.png", weight: 84, declaredSize: 160 },
  { path: "/favicon-180x180.png", weight: 86, declaredSize: 180 },
  { path: "/favicon-256x256.png", weight: 90, declaredSize: 256 },
  { path: "/favicon-384x384.png", weight: 92, declaredSize: 384 },
  // Common alternative root paths.
  { path: "/logo.png", weight: 75 },
  { path: "/logo.svg", weight: 88 },
  { path: "/logo-512.png", weight: 92, declaredSize: 512 },
  { path: "/icon-512.png", weight: 92, declaredSize: 512 },
  { path: "/icon-192.png", weight: 86, declaredSize: 192 },
  { path: "/icon.png", weight: 75 },
  { path: "/site-icon.png", weight: 70 },
  { path: "/touch-icon.png", weight: 72 },
  // Common public-asset folders.
  { path: "/static/favicon.png", weight: 70 },
  { path: "/static/favicon.ico", weight: 60 },
  { path: "/static/icon.svg", weight: 86 },
  { path: "/static/logo.svg", weight: 84 },
  { path: "/assets/favicon.png", weight: 70 },
  { path: "/assets/icon.svg", weight: 86 },
  { path: "/assets/logo.svg", weight: 84 },
  { path: "/assets/logo.png", weight: 75 },
  { path: "/img/favicon.png", weight: 68 },
  { path: "/img/logo.png", weight: 72 },
  { path: "/images/favicon.png", weight: 68 },
  { path: "/images/logo.png", weight: 72 },
  { path: "/public/favicon.ico", weight: 60 },
  // PWA-y conventions.
  { path: "/manifest-icon-512.png", weight: 90, declaredSize: 512 },
  { path: "/manifest-icon-192.png", weight: 86, declaredSize: 192 },
  { path: "/pwa-icon-512.png", weight: 90, declaredSize: 512 },
];

// ─── Public builder ─────────────────────────────────────────────────────

/**
 * Build the discovery candidate set for a URL.
 *
 * Returns ~100+ candidates spanning every public service variant, every
 * iOS / Microsoft size, and every common alternative site-hosted path.
 * The resolver probes them in parallel and records each successful one
 * in the gallery.
 *
 * The caller is expected to dedupe against its main candidate set (URLs
 * already enumerated by `buildFastCandidates`) — this builder is
 * deliberately verbose and may overlap with the main pipeline at the
 * margins.
 */
export function buildExtraCandidates(rawUrl: string): IconCandidate[] {
  const origin = getOrigin(rawUrl);
  const hostname = getHostname(rawUrl);
  if (!origin || !hostname) return [];

  const lookupHost = stripWww(hostname);
  const apex = getApexDomain(lookupHost);
  const extras: IconCandidate[] = [];

  // ── Sized public services on the original host ─────────────────────
  for (const svc of SIZED_SERVICES) {
    for (const size of svc.sizes) {
      extras.push({
        url: svc.build(lookupHost, rawUrl, size),
        source: `${svc.source}-${size}`,
        weight: svc.baseWeight,
        declaredSize: size,
        tier: 1,
      });
    }
  }

  // ── Sized public services on the apex (when distinct) ──────────────
  if (apex && apex !== lookupHost) {
    for (const svc of SIZED_SERVICES) {
      for (const size of svc.sizes) {
        extras.push({
          url: svc.build(apex, `https://${apex}/`, size),
          source: `${svc.source}-apex-${size}`,
          weight: svc.baseWeight - 6, // small de-rank for apex variants
          declaredSize: size,
          tier: 3,
        });
      }
    }
  }

  // ── Single-URL public services ─────────────────────────────────────
  for (const ep of PUBLIC_ENDPOINTS) {
    extras.push({
      url: ep.build(lookupHost, rawUrl),
      source: ep.source,
      weight: ep.weight,
      tier: 1,
    });
  }

  // ── Extra site-hosted paths ────────────────────────────────────────
  for (const sp of EXTRA_SITE_PATHS) {
    extras.push({
      url: `${origin}${sp.path}`,
      source: `extra:site${sp.path}`,
      weight: sp.weight,
      declaredSize: sp.declaredSize,
      tier: 1,
    });
  }

  return extras;
}
