/**
 * Shared types for the icon resolution engine.
 *
 * The engine resolves the best available favicon for any URL by racing
 * dozens of candidate sources, scoring them, and persisting the winner as
 * a data URL so subsequent renders are instant and offline-friendly.
 */

export type IconFormat =
  | "svg"
  | "png"
  | "ico"
  | "jpg"
  | "jpeg"
  | "webp"
  | "gif"
  | "unknown";

/** A single icon candidate to be probed. */
export interface IconCandidate {
  /** The URL we'll render or fetch. */
  url: string;
  /** Human-readable label for debugging / logs. */
  source: string;
  /** Source-quality bias added to the dimension score. */
  weight: number;
  /** Author-declared size, when known (e.g. from `sizes="180x180"`). */
  declaredSize?: number;
  /** Best-effort format guess from extension or MIME type. */
  format?: IconFormat;
  /**
   * Execution tier. Lower tiers fire first; higher tiers only run when no
   * high-confidence winner has been found yet.
   *   1 — fast, high-quality public services
   *   2 — HTML / manifest scraping (CORS-proxied)
   *   3 — deep fallback (apex domain, generated avatar)
   */
  tier: 1 | 2 | 3;
}

/** Result of an `<img>` probe — the icon loaded successfully and we know its dimensions. */
export interface ProbeSuccess {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  format?: IconFormat;
}

/** Final resolved icon, returned to callers and persisted in cache. */
export interface IconResult {
  /** What the UI should render. Preferably a `data:` URL for stability. */
  url: string;
  /** Source label, mostly for debugging. */
  source: string;
  width: number;
  height: number;
  /** Composite quality score (≈0–1000, higher is better). */
  score: number;
  /** True when served from persistent cache rather than freshly resolved. */
  cached: boolean;
  format?: IconFormat;
}

export interface ResolveOptions {
  /**
   * Streaming progress callback. Fires every time a higher-scoring candidate
   * resolves so the UI can upgrade in place.
   */
  onProgress?: (result: IconResult) => void;
  /** Bypass cache and re-resolve from scratch. */
  forceRefresh?: boolean;
  /**
   * If true, the winning icon is fetched and persisted as a `data:` URL so
   * future renders work offline and never flash. Default: true.
   */
  persist?: boolean;
  /** External cancel signal. Honoured by the engine when supplied. */
  signal?: AbortSignal;
  /**
   * Wide-net discovery mode. When true, the resolver also probes ~100+
   * extra candidates from `extraSources.ts` (every public service at
   * every reasonable size, every iOS apple-touch-icon size, every common
   * alternative path) and records each successful probe in the icon
   * gallery. Used by Settings → Site Icons to give the user the widest
   * possible set of choices.
   *
   * Default: false. Discovery doesn't affect winner selection — extras
   * carry slightly lower weights so they can't accidentally outrank a
   * curated main-pipeline result. They only enrich the gallery.
   */
  discover?: boolean;
}
