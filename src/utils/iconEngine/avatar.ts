/**
 * Letter-avatar generator.
 *
 * The terminal fallback when no real icon is available — a colored,
 * gradient-filled rounded square stamped with the host's first letter.
 * Same visual that the Favicon component renders, exposed here so the
 * icon-customizer dialog can offer it as an explicit choice.
 *
 * Output is a self-contained `data:image/svg+xml;base64,…` URL: rendered
 * synchronously, no network, never fails.
 */

/** Brand-quality palette. Picked so any background pairs with white text. */
export const AVATAR_COLORS: readonly string[] = [
  "#007AFF",
  "#34C759",
  "#FF9500",
  "#FF2D55",
  "#AF52DE",
  "#5AC8FA",
  "#FFCC00",
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#DDA0DD",
  "#98D8C8",
  "#F7DC6F",
  "#BB8FCE",
  "#85C1E9",
  "#F1948A",
  "#82E0AA",
  "#F8C471",
  "#AED6F1",
];

/**
 * Deterministic hash → bucket index. Same input always yields the same
 * color, regardless of session.
 */
function hashIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  }
  return h % mod;
}

function darken(hex: string, amount = 35): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.max(0, r - amount)},${Math.max(0, g - amount)},${Math.max(0, b - amount)})`;
}

/**
 * Build a letter-avatar SVG data URL for a given seed (typically a hostname).
 * `slot` is the rendered viewBox size; output is intrinsically scalable.
 */
export function makeAvatarDataUrl(seed: string, slot = 256): string {
  const cleanSeed = seed || "?";
  const letter = (cleanSeed.charAt(0) || "?").toUpperCase();
  const bg = AVATAR_COLORS[hashIndex(cleanSeed, AVATAR_COLORS.length)];
  const darker = darken(bg, 35);
  const rx = Math.round(slot * 0.22);
  const fs = Math.round(slot * 0.46);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${slot} ${slot}" width="${slot}" height="${slot}">` +
    `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">` +
    `<stop offset="0%" stop-color="${bg}"/><stop offset="100%" stop-color="${darker}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${slot}" height="${slot}" rx="${rx}" ry="${rx}" fill="url(#g)"/>` +
    `<text x="50%" y="50%" font-family="-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Arial,sans-serif" font-size="${fs}" font-weight="700" fill="rgba(255,255,255,0.97)" text-anchor="middle" dominant-baseline="central">${letter}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}
