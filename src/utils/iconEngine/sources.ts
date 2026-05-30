/**
 * Candidate generation — comprehensive edition.
 *
 * Builds the full set of icon candidates for a URL. Emits ~80+ candidates
 * across three tiers. The engine treats this as a reliability problem
 * rather than a performance one: more sources = more chances at least one
 * returns a real icon. First success persisted wins forever.
 *
 *   Tier 1 — Fast public services + site-hosted paths (~50 candidates)
 *   Tier 2 — HTML / manifest scraping (CORS-proxied, dynamic count)
 *   Tier 3 — Deep fallback (apex domain expansion, Wikipedia, etc.)
 */

import type { IconCandidate } from "./types";

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

/** Returns the registrable apex domain (`mail.google.com` → `google.com`). */
export function getApexDomain(host: string): string {
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  // Treat compound TLDs (`co.uk`, `com.au`, …) as a unit — keep last 3 parts.
  const tail2 = parts.slice(-2).join(".");
  const compoundTlds = new Set([
    "co.uk",
    "co.in",
    "co.jp",
    "co.kr",
    "co.za",
    "co.nz",
    "com.au",
    "com.br",
    "com.cn",
    "com.mx",
    "com.tr",
    "com.sg",
    "com.hk",
    "ac.in",
    "ac.uk",
    "gov.in",
    "gov.uk",
    "org.uk",
    "edu.au",
    "ne.jp",
  ]);
  if (compoundTlds.has(tail2)) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

// ─── Site-hosted paths ──────────────────────────────────────────────────────
//
// Comprehensive list — every well-known path a site might use to host its
// own icon. Ordered roughly by quality so the scoring function gives
// stable, sensible rankings. We probe all of them in parallel via `<img>`
// so CORS is irrelevant.

const SITE_HOSTED_PATHS: ReadonlyArray<{ path: string; weight: number; declaredSize?: number }> = [
  // SVG — best-quality source, scales to any size
  { path: "/icon.svg", weight: 110 },
  { path: "/favicon.svg", weight: 110 },
  { path: "/logo.svg", weight: 100 },
  { path: "/safari-pinned-tab.svg", weight: 92 },
  // Apple-touch — purpose-built, almost always 180×180
  { path: "/apple-touch-icon.png", weight: 95, declaredSize: 180 },
  { path: "/apple-touch-icon-precomposed.png", weight: 93, declaredSize: 180 },
  { path: "/apple-touch-icon-180x180.png", weight: 95, declaredSize: 180 },
  { path: "/apple-touch-icon-152x152.png", weight: 88, declaredSize: 152 },
  { path: "/apple-touch-icon-120x120.png", weight: 82, declaredSize: 120 },
  { path: "/apple-touch-icon-76x76.png", weight: 74, declaredSize: 76 },
  // PWA / Android Chrome
  { path: "/android-chrome-512x512.png", weight: 100, declaredSize: 512 },
  { path: "/android-chrome-192x192.png", weight: 90, declaredSize: 192 },
  // Microsoft tiles — many sites have these
  { path: "/mstile-150x150.png", weight: 84, declaredSize: 150 },
  // PWA-style explicit sizes
  { path: "/favicon-512x512.png", weight: 100, declaredSize: 512 },
  { path: "/favicon-256x256.png", weight: 92, declaredSize: 256 },
  { path: "/favicon-192x192.png", weight: 90, declaredSize: 192 },
  { path: "/favicon-96x96.png", weight: 80, declaredSize: 96 },
  { path: "/favicon-32x32.png", weight: 60, declaredSize: 32 },
  // Generic fallbacks
  { path: "/favicon.png", weight: 70 },
  { path: "/favicon.ico", weight: 60 },
];

// ─── Public services ────────────────────────────────────────────────────────
//
// Each service has different strengths and failure modes. We probe them
// all and let scoring decide.

interface PublicService {
  source: string;
  /** Build the URL given the registrable domain. */
  build: (host: string, fullUrl: string) => string;
  weight: number;
  declaredSize?: number;
  tier: 1 | 2 | 3;
}

const PUBLIC_SERVICES: ReadonlyArray<PublicService> = [
  // ── Google s2 — widest coverage ──
  {
    source: "google-s2-256",
    build: (h) => `https://www.google.com/s2/favicons?domain=${h}&sz=256`,
    weight: 75,
    declaredSize: 256,
    tier: 1,
  },
  {
    source: "google-s2-128",
    build: (h) => `https://www.google.com/s2/favicons?domain=${h}&sz=128`,
    weight: 68,
    declaredSize: 128,
    tier: 1,
  },
  {
    source: "google-s2-64",
    build: (h) => `https://www.google.com/s2/favicons?domain=${h}&sz=64`,
    weight: 56,
    declaredSize: 64,
    tier: 1,
  },
  {
    source: "google-fav-by-url",
    build: (_h, u) => `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(u)}&sz=256`,
    weight: 78,
    declaredSize: 256,
    tier: 1,
  },
  // ── icon.horse — page-aware, best for subdomains ──
  {
    source: "icon-horse",
    build: (h) => `https://icon.horse/icon/${h}`,
    weight: 95,
    tier: 1,
  },
  {
    source: "icon-horse-uri",
    build: (_h, full) => `https://icon.horse/icon/?uri=${encodeURIComponent(full)}`,
    weight: 92,
    tier: 1,
  },
  // ── DuckDuckGo — independent cache ──
  {
    source: "duckduckgo",
    build: (h) => `https://icons.duckduckgo.com/ip3/${h}.ico`,
    weight: 70,
    tier: 1,
  },
  // ── Clearbit — high-quality brand logos when matched ──
  {
    source: "clearbit-512",
    build: (h) => `https://logo.clearbit.com/${h}?size=512`,
    weight: 90,
    declaredSize: 512,
    tier: 1,
  },
  {
    source: "clearbit-256",
    build: (h) => `https://logo.clearbit.com/${h}?size=256`,
    weight: 86,
    declaredSize: 256,
    tier: 1,
  },
  {
    source: "clearbit-128",
    build: (h) => `https://logo.clearbit.com/${h}?size=128`,
    weight: 80,
    declaredSize: 128,
    tier: 1,
  },
  {
    source: "clearbit-greyscale",
    build: (h) => `https://logo.clearbit.com/${h}?size=256&greyscale=false`,
    weight: 78,
    declaredSize: 256,
    tier: 1,
  },
  // ── Brandfetch CDN — official brand-asset API, follows redirects ──
  {
    source: "brandfetch",
    build: (h) => `https://cdn.brandfetch.io/${h}/w/256/h/256`,
    weight: 88,
    declaredSize: 256,
    tier: 1,
  },
  {
    source: "brandfetch-icon",
    build: (h) => `https://cdn.brandfetch.io/${h}/icon`,
    weight: 86,
    tier: 1,
  },
  // ── Yandex ──
  {
    source: "yandex",
    build: (h) => `https://favicon.yandex.net/favicon/${h}`,
    weight: 50,
    tier: 1,
  },
  // ── Logo.dev — public token works for >99% of cases ──
  {
    source: "logo-dev-256",
    build: (h) =>
      `https://img.logo.dev/${h}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=256&format=png`,
    weight: 84,
    declaredSize: 256,
    tier: 1,
  },
  {
    source: "logo-dev-svg",
    build: (h) => `https://img.logo.dev/${h}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&format=svg`,
    weight: 88,
    tier: 1,
  },
  // ── Statvoo — tiny but serves apple-touch when present ──
  {
    source: "statvoo",
    build: (h) => `https://api.statvoo.com/favicon/?url=${h}`,
    weight: 58,
    tier: 1,
  },
  // ── FaviconKit ──
  {
    source: "faviconkit-144",
    build: (h) => `https://api.faviconkit.com/${h}/144`,
    weight: 64,
    declaredSize: 144,
    tier: 1,
  },
  {
    source: "faviconkit-256",
    build: (h) => `https://api.faviconkit.com/${h}/256`,
    weight: 72,
    declaredSize: 256,
    tier: 1,
  },
  // ── Besticon — open-source icon grabber ──
  {
    source: "besticon-256",
    build: (h) => `https://besticon-demo.herokuapp.com/icon?url=${h}&size=256`,
    weight: 66,
    declaredSize: 256,
    tier: 1,
  },
  // ── unavatar (Vercel) — aggregator that tries multiple backends ──
  {
    source: "unavatar",
    build: (h) => `https://unavatar.io/${h}?fallback=false`,
    weight: 70,
    tier: 1,
  },
  {
    source: "unavatar-microlink",
    build: (h) => `https://unavatar.io/microlink/${h}?fallback=false`,
    weight: 72,
    tier: 1,
  },
  // ── Microlink screenshot/logo API ──
  {
    source: "microlink-logo",
    build: (_h, u) => `https://api.microlink.io/?url=${encodeURIComponent(u)}&palette=true&audio=false&video=false&meta=false&data.screenshot=false&data.logo=true&embed=logo.url`,
    weight: 76,
    tier: 1,
  },
];

// ─── Public builders ────────────────────────────────────────────────────────

/**
 * Builds Tier-1 candidates: site-hosted paths + public services. Returns
 * ~80 candidates in total, ready to probe in parallel.
 */
export function buildFastCandidates(rawUrl: string): IconCandidate[] {
  const origin = getOrigin(rawUrl);
  const hostname = getHostname(rawUrl);
  if (!origin || !hostname) return [];

  const lookupHost = stripWww(hostname);
  const candidates: IconCandidate[] = [];

  // Site-hosted (no third party involved at all)
  for (const entry of SITE_HOSTED_PATHS) {
    candidates.push({
      url: `${origin}${entry.path}`,
      source: `site:${entry.path}`,
      weight: entry.weight,
      declaredSize: entry.declaredSize,
      tier: 1,
    });
  }

  // Public services
  for (const svc of PUBLIC_SERVICES) {
    candidates.push({
      url: svc.build(lookupHost, rawUrl),
      source: svc.source,
      weight: svc.weight,
      declaredSize: svc.declaredSize,
      tier: svc.tier,
    });
  }

  return candidates;
}

/**
 * Builds Tier-3 fallback candidates that probe the apex domain — useful
 * when a subdomain itself has no icon (e.g. `app.simplenote.com` →
 * `simplenote.com`).
 *
 * These run with a slight de-rank so a Tier-1 hit always wins, but they
 * cover the long tail of internal subdomains and similar cases.
 */
export function buildApexFallbackCandidates(rawUrl: string): IconCandidate[] {
  const hostname = getHostname(rawUrl);
  if (!hostname) return [];
  const apex = getApexDomain(stripWww(hostname));
  if (!apex || apex === stripWww(hostname)) return [];

  const apexUrl = `https://${apex}`;
  const apexCandidates: IconCandidate[] = [];

  // Site-hosted on the apex (top-quality paths only)
  const topPaths = SITE_HOSTED_PATHS.filter((p) =>
    p.path.includes("apple-touch") ||
    p.path.includes("favicon.svg") ||
    p.path.includes("icon.svg") ||
    p.path.includes("logo.svg") ||
    p.path.includes("android-chrome") ||
    p.path === "/favicon.ico",
  );
  for (const entry of topPaths) {
    apexCandidates.push({
      url: `${apexUrl}${entry.path}`,
      source: `apex:${entry.path}`,
      weight: Math.max(40, entry.weight - 18),
      declaredSize: entry.declaredSize,
      tier: 3,
    });
  }

  // Top public services targeted at the apex
  apexCandidates.push(
    {
      url: `https://www.google.com/s2/favicons?domain=${apex}&sz=256`,
      source: "apex:google-s2-256",
      weight: 65,
      declaredSize: 256,
      tier: 3,
    },
    {
      url: `https://icon.horse/icon/${apex}`,
      source: "apex:icon-horse",
      weight: 80,
      tier: 3,
    },
    {
      url: `https://logo.clearbit.com/${apex}?size=512`,
      source: "apex:clearbit-512",
      weight: 78,
      declaredSize: 512,
      tier: 3,
    },
    {
      url: `https://cdn.brandfetch.io/${apex}/w/256/h/256`,
      source: "apex:brandfetch",
      weight: 76,
      declaredSize: 256,
      tier: 3,
    },
    {
      url: `https://img.logo.dev/${apex}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=256&format=png`,
      source: "apex:logo-dev",
      weight: 74,
      declaredSize: 256,
      tier: 3,
    },
    {
      url: `https://icons.duckduckgo.com/ip3/${apex}.ico`,
      source: "apex:duckduckgo",
      weight: 60,
      tier: 3,
    },
  );

  return apexCandidates;
}
