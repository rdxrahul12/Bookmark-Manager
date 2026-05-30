// Centralized URL helpers. All user-supplied URL parsing should go through
// these so we never crash on malformed input.

export function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function getHostname(url: string): string {
  const parsed = tryParseUrl(url);
  if (!parsed) return "";
  return parsed.hostname.replace(/^www\./, "");
}

export function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
  return tryParseUrl(candidate) ? candidate : null;
}

export function deriveTitleFromUrl(url: string): string {
  const host = getHostname(url);
  if (!host) return "Untitled";
  const stem = host.split(".")[0] ?? host;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}
