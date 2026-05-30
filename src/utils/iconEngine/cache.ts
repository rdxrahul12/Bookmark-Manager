/**
 * Two-layer icon cache.
 *
 *   layer 1 — in-memory `Map`, hot path for the same hostname requested
 *             multiple times in a single session.
 *   layer 2 — IndexedDB, durable across reloads. Holds the full `IconResult`
 *             which usually contains a `data:` URL, so revisits are instant
 *             and don't hit the network at all.
 *
 * TTLs are deliberately long because a resolved icon almost never changes —
 * brands rarely re-skin. We re-resolve on `forceRefresh` or after the TTL
 * elapses; transient misses are cached for a short window so a network
 * hiccup doesn't poison the cache.
 */

import { logger } from "@/lib/logger";
import type { IconResult } from "./types";

const DB_NAME = "bookmark-icons:v8";
const STORE = "icons";
const TTL_DATA_URL = 30 * 24 * 60 * 60 * 1000; // 30 days for fully-persisted data URLs
const TTL_REMOTE = 60 * 60 * 1000; // 1 hour for remote URLs (transient-friendly)
const TTL_MISS = 5 * 60 * 1000; // 5 minutes — short, self-heals on flaky network

interface CacheEntry {
  key: string;
  result: IconResult | null;
  expiresAt: number;
}

class IconCache {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private mem = new Map<string, CacheEntry>();

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
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  /**
   * Returns:
   *   - `IconResult` if a hit
   *   - `null` if a cached *miss* (every probe failed within TTL_MISS)
   *   - `undefined` if there's no entry — caller should resolve fresh
   */
  async get(key: string): Promise<IconResult | null | undefined> {
    const cached = this.mem.get(key);
    if (cached) {
      if (Date.now() < cached.expiresAt) return cached.result;
      this.mem.delete(key);
    }
    const db = await this.open();
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => {
          const entry = req.result as CacheEntry | undefined;
          if (!entry || Date.now() > entry.expiresAt) {
            resolve(undefined);
            return;
          }
          this.mem.set(key, entry);
          resolve(entry.result);
        };
        req.onerror = () => resolve(undefined);
      } catch (err) {
        logger.debug("[icon-cache] get failed", err);
        resolve(undefined);
      }
    });
  }

  async set(key: string, result: IconResult | null, ttl?: number): Promise<void> {
    const finalTtl =
      ttl ??
      (result === null
        ? TTL_MISS
        : result.url.startsWith("data:")
          ? TTL_DATA_URL
          : TTL_REMOTE);
    const entry: CacheEntry = { key, result, expiresAt: Date.now() + finalTtl };
    this.mem.set(key, entry);
    const db = await this.open();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (err) {
        logger.debug("[icon-cache] set failed", err);
        resolve();
      }
    });
  }

  /** Drop the cached entry for a key — used on `forceRefresh`. */
  async invalidate(key: string): Promise<void> {
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

export const iconCache = new IconCache();
export const TTL_DATA_URL_MS = TTL_DATA_URL;
export const TTL_REMOTE_MS = TTL_REMOTE;
export const TTL_MISS_MS = TTL_MISS;
