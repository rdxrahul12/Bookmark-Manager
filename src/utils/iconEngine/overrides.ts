/**
 * Curated icon overrides — multi-fallback per host.
 *
 * Why these exist: a small set of high-traffic hosts genuinely defeat
 * every public favicon service AND would lose the score race to a
 * generic apex-domain result. Examples:
 *
 *   • Google Workspace subdomains (`classroom`, `keep`, `calendar`, …)
 *     — `keep.google.com`'s real icon is at `gstatic.com/.../keep_2020q4`,
 *     but Google s2 returns a 32×32 G placeholder. Worse, our Tier-3
 *     apex fallback returns the *256×256 Google G mark*, which would
 *     beat the real product icon on dimension score.
 *
 *   • Indian e-commerce (`flipkart.com`, `ajio.com`) — `s2` blocks them
 *     entirely; their site-hosted apple-touch-icons require the live
 *     site (which is bot-walled); only `icon.horse/icon/<apex>` returns
 *     the real logo cleanly.
 *
 *   • AWS console / corp subdomains — public services strip the
 *     subdomain and return Amazon's generic smile.
 *
 * **Each override entry can return MULTIPLE candidates** for the same
 * host. We race them all; whichever loads fastest with the highest
 * dimensions wins. This means a single failing CDN (rate-limited
 * icon.horse, 502 from gstatic) doesn't break the whole host — the
 * backup candidate fills in.
 *
 * **Override weight is set high enough (≥200) to outscore any other
 * Tier-1 result.** This is intentional: when we have a curated answer,
 * it's the right answer. Generic services giving us "Google G" for
 * `keep.google.com` is a *bug from the user's perspective*, even if
 * the dimension is huge.
 *
 * The engine also disables Tier-3 apex fallback entirely when an
 * override matches, so the apex-domain generic icon never enters the
 * race.
 */

import type { IconCandidate } from "./types";

interface Override {
  /** Host suffix to match (no leading dot). Bare apex matches itself + subdomains. */
  hostSuffix: string;
  /** One or more candidate URLs, in preferred order. The first to load wins. */
  candidates: Array<{ url: string; source: string; declaredSize?: number }>;
}

/**
 * Each override produces high-weight candidates (≥200) so they always
 * outscore generic-service or apex results. The engine probes all
 * candidates in parallel; whichever loads at the highest quality wins.
 */
const OVERRIDES: ReadonlyArray<Override> = [
  // ───── Google Workspace ─────
  {
    hostSuffix: "mail.google.com",
    candidates: [
      {
        url: "https://www.gstatic.com/images/branding/productlogos/gmail_2020q4/v11/192px.svg",
        source: "override:gmail-gstatic",
        declaredSize: 192,
      },
      {
        url: "https://icon.horse/icon/mail.google.com",
        source: "override:gmail-iconhorse",
        declaredSize: 256,
      },
    ],
  },
  {
    hostSuffix: "keep.google.com",
    candidates: [
      {
        url: "https://www.gstatic.com/images/branding/productlogos/keep_2020q4/v8/192px.svg",
        source: "override:keep-gstatic",
        declaredSize: 192,
      },
      {
        url: "https://icon.horse/icon/keep.google.com",
        source: "override:keep-iconhorse",
        declaredSize: 256,
      },
    ],
  },
  {
    hostSuffix: "calendar.google.com",
    candidates: [
      {
        url: "https://www.gstatic.com/images/branding/productlogos/calendar_2020q4/v13/192px.svg",
        source: "override:calendar-gstatic",
        declaredSize: 192,
      },
      {
        url: "https://icon.horse/icon/calendar.google.com",
        source: "override:calendar-iconhorse",
        declaredSize: 256,
      },
    ],
  },
  {
    hostSuffix: "drive.google.com",
    candidates: [
      {
        url: "https://www.gstatic.com/images/branding/productlogos/drive_2020q4/v10/192px.svg",
        source: "override:drive-gstatic",
        declaredSize: 192,
      },
      {
        url: "https://icon.horse/icon/drive.google.com",
        source: "override:drive-iconhorse",
        declaredSize: 256,
      },
    ],
  },
  {
    hostSuffix: "docs.google.com",
    candidates: [
      {
        url: "https://www.gstatic.com/images/branding/productlogos/docs_2020q4/v12/192px.svg",
        source: "override:docs-gstatic",
        declaredSize: 192,
      },
      {
        url: "https://icon.horse/icon/docs.google.com",
        source: "override:docs-iconhorse",
        declaredSize: 256,
      },
    ],
  },
  {
    hostSuffix: "sheets.google.com",
    candidates: [
      {
        url: "https://www.gstatic.com/images/branding/productlogos/sheets_2020q4/v11/192px.svg",
        source: "override:sheets-gstatic",
        declaredSize: 192,
      },
    ],
  },
  {
    hostSuffix: "slides.google.com",
    candidates: [
      {
        url: "https://www.gstatic.com/images/branding/productlogos/slides_2020q4/v12/192px.svg",
        source: "override:slides-gstatic",
        declaredSize: 192,
      },
    ],
  },
  {
    hostSuffix: "forms.google.com",
    candidates: [
      {
        url: "https://www.gstatic.com/images/branding/productlogos/forms_2020q4/v6/192px.svg",
        source: "override:forms-gstatic",
        declaredSize: 192,
      },
    ],
  },
  {
    hostSuffix: "meet.google.com",
    candidates: [
      {
        url: "https://www.gstatic.com/images/branding/productlogos/meet_2020q4/v8/192px.svg",
        source: "override:meet-gstatic",
        declaredSize: 192,
      },
    ],
  },
  {
    hostSuffix: "chat.google.com",
    candidates: [
      {
        url: "https://www.gstatic.com/images/branding/productlogos/chat_2020q4/v8/192px.svg",
        source: "override:chat-gstatic",
        declaredSize: 192,
      },
    ],
  },
  {
    hostSuffix: "classroom.google.com",
    candidates: [
      // icon.horse returns the real Classroom-specific 256×256 PNG —
      // verified distinct hash from google.com generic favicon.
      {
        url: "https://icon.horse/icon/classroom.google.com",
        source: "override:classroom-iconhorse",
        declaredSize: 256,
      },
      // Wikipedia commons SVG as backup. Browsers send a real UA so this
      // resolves cleanly even though `curl/X` UA is rejected.
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/1/19/Google_Classroom_Logo.svg",
        source: "override:classroom-wiki",
      },
      {
        url: "https://www.gstatic.com/images/branding/product/2x/classroom_48dp.png",
        source: "override:classroom-gstatic",
        declaredSize: 96,
      },
    ],
  },
  {
    hostSuffix: "photos.google.com",
    candidates: [
      {
        url: "https://www.gstatic.com/images/branding/product/2x/photos_48dp.png",
        source: "override:photos-gstatic",
        declaredSize: 96,
      },
      {
        url: "https://icon.horse/icon/photos.google.com",
        source: "override:photos-iconhorse",
        declaredSize: 256,
      },
    ],
  },
  {
    hostSuffix: "translate.google.com",
    candidates: [
      {
        url: "https://www.gstatic.com/images/branding/product/2x/translate_48dp.png",
        source: "override:translate-gstatic",
        declaredSize: 96,
      },
    ],
  },
  {
    hostSuffix: "maps.google.com",
    candidates: [
      {
        url: "https://www.gstatic.com/images/branding/product/2x/maps_48dp.png",
        source: "override:maps-gstatic",
        declaredSize: 96,
      },
    ],
  },

  // ───── Indian e-commerce ─────
  // icon.horse's `<host>` endpoint returns the real product logo at
  // 256×256 PNG. Verified distinct content (md5 hash) from the generic
  // service. Wikipedia is a backup when icon.horse rate-limits.
  {
    hostSuffix: "flipkart.com",
    candidates: [
      {
        url: "https://icon.horse/icon/flipkart.com",
        source: "override:flipkart-iconhorse",
        declaredSize: 256,
      },
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/e/e5/Flipkart_logo_%282026%29.svg",
        source: "override:flipkart-wiki",
      },
    ],
  },
  {
    hostSuffix: "ajio.com",
    candidates: [
      {
        url: "https://icon.horse/icon/ajio.com",
        source: "override:ajio-iconhorse",
        declaredSize: 256,
      },
    ],
  },
  {
    hostSuffix: "smartprix.com",
    candidates: [
      {
        url: "https://icon.horse/icon/smartprix.com",
        source: "override:smartprix-iconhorse",
        declaredSize: 256,
      },
    ],
  },
  {
    hostSuffix: "myntra.com",
    candidates: [
      {
        url: "https://icon.horse/icon/myntra.com",
        source: "override:myntra-iconhorse",
        declaredSize: 256,
      },
    ],
  },
  {
    hostSuffix: "meesho.com",
    candidates: [
      { url: "https://icon.horse/icon/meesho.com", source: "override:meesho-iconhorse", declaredSize: 256 },
    ],
  },
  {
    hostSuffix: "nykaa.com",
    candidates: [
      { url: "https://icon.horse/icon/nykaa.com", source: "override:nykaa-iconhorse", declaredSize: 256 },
    ],
  },
  {
    hostSuffix: "snapdeal.com",
    candidates: [
      { url: "https://icon.horse/icon/snapdeal.com", source: "override:snapdeal-iconhorse", declaredSize: 256 },
    ],
  },

  // ───── AWS / Amazon corp ─────
  {
    hostSuffix: "aws.amazon.com",
    candidates: [
      {
        url: "https://a0.awsstatic.com/libra-css/images/site/touch-icon-ipad-144-precomposed.png",
        source: "override:aws-touchicon",
        declaredSize: 144,
      },
    ],
  },
  {
    hostSuffix: "console.aws.amazon.com",
    candidates: [
      {
        url: "https://a0.awsstatic.com/libra-css/images/site/touch-icon-ipad-144-precomposed.png",
        source: "override:aws-console",
        declaredSize: 144,
      },
    ],
  },
  {
    hostSuffix: "quicksight.aws.amazon.com",
    candidates: [
      {
        url: "https://a0.awsstatic.com/libra-css/images/site/touch-icon-ipad-144-precomposed.png",
        source: "override:aws-quicksight",
        declaredSize: 144,
      },
    ],
  },

  // ───── Other commonly-broken hosts ─────
  {
    hostSuffix: "openai.com",
    candidates: [
      { url: "https://icon.horse/icon/openai.com", source: "override:openai-iconhorse", declaredSize: 256 },
    ],
  },
  {
    hostSuffix: "chatgpt.com",
    candidates: [
      { url: "https://icon.horse/icon/chatgpt.com", source: "override:chatgpt-iconhorse", declaredSize: 256 },
    ],
  },
  {
    hostSuffix: "claude.ai",
    candidates: [
      { url: "https://icon.horse/icon/claude.ai", source: "override:claude-iconhorse", declaredSize: 256 },
    ],
  },
];

/** True if `host` is `suffix` or a subdomain ending in `.suffix`. */
function hostMatches(host: string, suffix: string): boolean {
  const stripped = host.replace(/^www\./, "");
  if (stripped === suffix) return true;
  return stripped.endsWith(`.${suffix}`);
}

/**
 * Override weight. Set high enough (220) to dominate the score race
 * regardless of the dimension scoring of competing results — when we
 * have a curated answer, it IS the right answer.
 */
const OVERRIDE_WEIGHT = 220;

/**
 * Returns override candidates for a given URL. The most-specific match
 * wins (longer hostSuffix), so e.g. `console.aws.amazon.com` beats the
 * generic `amazon.com` rule.
 */
export function getOverrideCandidates(rawUrl: string): IconCandidate[] {
  let host: string;
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    return [];
  }
  const matches = OVERRIDES.filter((o) => hostMatches(host, o.hostSuffix));
  if (matches.length === 0) return [];
  // Prefer the most specific match.
  matches.sort((a, b) => b.hostSuffix.length - a.hostSuffix.length);
  const best = matches[0];

  return best.candidates.map((c, i) => ({
    url: c.url,
    source: c.source,
    // First candidate gets the full weight; backups get a tiny de-rank
    // so that, when multiple succeed, we prefer the curator's first
    // pick.
    weight: OVERRIDE_WEIGHT - i * 2,
    declaredSize: c.declaredSize,
    tier: 1 as const,
  }));
}
