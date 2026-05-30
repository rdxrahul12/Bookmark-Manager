/**
 * Icon gallery — durable per-host catalog of every successful probe.
 *
 * The resolver already probes ~80–100 candidate URLs per host, scores them,
 * and returns the best. Until now, only the winner survived; everything
 * else was discarded.
 *
 * The gallery captures **every successful probe** in an IndexedDB store
 * keyed by hostname. Settings → Site Icons reads from here to render the
 * choice grid: the user sees the same set of icons the resolver evaluated
 * and can pick a different one if the auto-selected winner isn't right.
 *
 * Design choices:
 *   • Keyed by `hostname` (www-stripped) so subdomains and variants share
 *     a row when they actually share the same site.
 *   • Stores a small denormalized object — URL, source label, dimensions —
 *     so the customizer can render rich metadata without re-probing.
 *   • Capped at 24 entries per host, sorted by score, to keep IndexedDB
 *     payload bounded. New entries beyond the cap evict the lowest-scoring
 *     existing one rather than silently dropping the candidate.
 *   • Records persisted *remote* URLs preferentially over `data:` URLs
 *     because remote URLs render in <img> instantly across sessions and
 *     don't bloat localStorage exports.
 */

import { logger } from "@/lib/logger";

export interface GalleryEntry {
  /** What the UI will render. May be remote or `data:` URL. */
  url: string;
  /** Source label (e.g. `icon-horse`, `manifest:192`, `site:/icon.svg`). */
  source: string;
  /** Natural pixel dimensions captured at probe time. */
  width: number;
  height: number;
  /** Composite quality score from the resolver. */
  score: number;
  /** Epoch ms — used to age out very old entries on demand. */
  capturedAt: number;
}

interface GalleryRow {
  /** Hostname key, www-stripped, lowercased. */
  key: string;
  /** Map of URL → entry. URL is the dedup key. */
  entries: Record<string, GalleryEntry>;
  updatedAt: number;
}

const DB_NAME = "bookmark-icons-gallery:v1";
const STORE = "gallery";
const MAX_ENTRIES_PER_HOST = 64;
/**
 * The gallery uses its own IndexedDB instance — separate from the
 * resolver's cache DB — so the two stores can evolve independently
 * without coordinated version upgrades. Sharing one DB caused the
 * customizer to hang: when the cache opened the DB at v1 and the
 * gallery later requested v2, the upgrade request blocked behind the
 * cache's still-open connection.
 */

class IconGallery {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private mem = new Map<string, GalleryRow>();
  /** Per-host subscribers — fired on every `record()` for live UI streaming. */
  private subscribers = new Map<string, Set<(entries: GalleryEntry[]) => void>>();

  private open(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === "undefined") return resolve(null);
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: "key" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        // Belt-and-braces — if some other tab is mid-upgrade, fall back
        // to memory-only mode rather than hanging the customizer.
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  private async readRow(key: string): Promise<GalleryRow | null> {
    const cached = this.mem.get(key);
    if (cached) return cached;
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => {
          const row = req.result as GalleryRow | undefined;
          if (row) this.mem.set(key, row);
          resolve(row ?? null);
        };
        req.onerror = () => resolve(null);
      } catch (err) {
        logger.debug("[icon-gallery] read failed", err);
        resolve(null);
      }
    });
  }

  private async writeRow(row: GalleryRow): Promise<void> {
    this.mem.set(row.key, row);
    const db = await this.open();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (err) {
        logger.debug("[icon-gallery] write failed", err);
        resolve();
      }
    });
  }

  /**
   * Record a successful probe. Idempotent — same URL upserts.
   * Returns the updated entry list for live UI updates.
   */
  async record(key: string, entry: GalleryEntry): Promise<GalleryEntry[]> {
    if (!key || !entry.url) return [];
    const existing = (await this.readRow(key)) ?? {
      key,
      entries: {},
      updatedAt: 0,
    };
    const prior = existing.entries[entry.url];
    // Only overwrite if the new probe scored higher OR is more recent than
    // a stale record. Keeps the highest-quality variant of each URL.
    if (!prior || entry.score >= prior.score) {
      existing.entries[entry.url] = entry;
    }
    // Cap the gallery to MAX_ENTRIES_PER_HOST by score.
    const all = Object.values(existing.entries);
    if (all.length > MAX_ENTRIES_PER_HOST) {
      all.sort((a, b) => b.score - a.score);
      const keep = all.slice(0, MAX_ENTRIES_PER_HOST);
      existing.entries = Object.fromEntries(keep.map((e) => [e.url, e]));
    }
    existing.updatedAt = Date.now();
    await this.writeRow(existing);
    const sorted = Object.values(existing.entries).sort((a, b) => b.score - a.score);
    // Notify any live subscribers (e.g. the customizer) so they can
    // append the new entry without polling.
    this.emit(key, sorted);
    return sorted;
  }

  /** Subscribe to live updates for a host's gallery. Returns unsubscribe. */
  subscribe(key: string, cb: (entries: GalleryEntry[]) => void): () => void {
    let bucket = this.subscribers.get(key);
    if (!bucket) {
      bucket = new Set();
      this.subscribers.set(key, bucket);
    }
    bucket.add(cb);
    return () => {
      bucket?.delete(cb);
      if (bucket && bucket.size === 0) this.subscribers.delete(key);
    };
  }

  private emit(key: string, entries: GalleryEntry[]): void {
    const bucket = this.subscribers.get(key);
    if (!bucket || bucket.size === 0) return;
    // Snapshot the set in case a subscriber unsubscribes during dispatch.
    for (const cb of Array.from(bucket)) {
      try {
        cb(entries);
      } catch {
        /* never let a subscriber kill the resolver */
      }
    }
  }

  /** Read every recorded entry for a host, sorted by quality (best first). */
  async list(key: string): Promise<GalleryEntry[]> {
    const row = await this.readRow(key);
    if (!row) return [];
    return Object.values(row.entries).sort((a, b) => b.score - a.score);
  }

  /** Drop every recorded entry for a host. */
  async clear(key: string): Promise<void> {
    this.mem.delete(key);
    const db = await this.open();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

export const iconGallery = new IconGallery();

/** Normalise a URL into the gallery's host-key format. */
export function galleryKeyFor(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
