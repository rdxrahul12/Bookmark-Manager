// Safe storage wrapper. Falls back to in-memory when localStorage is unavailable
// (private mode, some extensions contexts, embed scenarios) and never throws.
import { logger } from "./logger";

const memoryFallback = new Map<string, string>();

function hasLocalStorage(): boolean {
  try {
    const probe = "__probe__";
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

const useNative = typeof window !== "undefined" && hasLocalStorage();

export const safeStorage = {
  get(key: string): string | null {
    try {
      if (useNative) return window.localStorage.getItem(key);
      return memoryFallback.get(key) ?? null;
    } catch (err) {
      logger.warn("[storage] get failed", key, err);
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      if (useNative) window.localStorage.setItem(key, value);
      else memoryFallback.set(key, value);
    } catch (err) {
      logger.warn("[storage] set failed", key, err);
    }
  },
  remove(key: string): void {
    try {
      if (useNative) window.localStorage.removeItem(key);
      else memoryFallback.delete(key);
    } catch (err) {
      logger.warn("[storage] remove failed", key, err);
    }
  },
};

export function readJSON<T>(key: string): T | null {
  const raw = safeStorage.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn(`[storage] corrupt JSON at ${key}, ignoring`, err);
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    safeStorage.set(key, JSON.stringify(value));
  } catch (err) {
    logger.warn(`[storage] failed to stringify ${key}`, err);
  }
}
