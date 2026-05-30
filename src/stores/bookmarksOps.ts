// Domain-level operations that compose store actions with side effects
// (file I/O, chrome APIs). Kept out of the store so the store stays pure
// and testable.

import { useBookmarksStore } from "@/stores/bookmarksStore";
import {
  Bookmark,
  Category,
  BookmarkSchema,
  CategorySchema,
} from "@/types/bookmark";
import { downloadJSON } from "@/lib/download";
import { hasTabsApi } from "@/lib/env";
import { logger } from "@/lib/logger";

// ── Export ──────────────────────────────────────────────────────────────────

interface ExportShape {
  version: string;
  exportedAt: string;
  categories: Array<{ id: string; name: string; emoji: string; color?: string }>;
  bookmarks: Array<{
    id: string;
    name: string;
    url: string;
    categoryId: string;
    usageCount: number;
    lastUsed: number;
  }>;
}

export function exportData(): void {
  const { bookmarks, categories } = useBookmarksStore.getState();
  const payload: ExportShape = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      color: c.color,
    })),
    bookmarks: bookmarks.map((b) => ({
      id: b.id,
      name: b.title,
      url: b.url,
      categoryId: b.category,
      usageCount: 0,
      lastUsed: b.createdAt,
    })),
  };
  const stamp = new Date().toISOString().split("T")[0];
  downloadJSON(`bookmarks-${stamp}.json`, payload);
}

// ── Import ──────────────────────────────────────────────────────────────────
// Accepts either:
//   * a raw array of legacy bookmarks
//   * an object with `bookmarks` / `categories` keys (current export format)
//   * either of the above with new or legacy field names
// Each entry is validated; invalid ones are skipped instead of crashing.

export async function importData(file: File): Promise<{
  importedBookmarks: number;
  importedCategories: number;
}> {
  const text = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Invalid file format");
  }

  let rawBookmarks: unknown[] = [];
  let rawCategories: unknown[] = [];

  if (Array.isArray(raw)) {
    rawBookmarks = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.bookmarks)) rawBookmarks = obj.bookmarks;
    if (Array.isArray(obj.categories)) rawCategories = obj.categories;
  } else {
    throw new Error("Invalid file format");
  }

  const categories: Category[] = rawCategories
    .map((entry): Category | null => {
      if (!entry || typeof entry !== "object") return null;
      const c = entry as Record<string, unknown>;
      const candidate = {
        id: typeof c.id === "string" && c.id.length > 0 ? c.id : crypto.randomUUID(),
        name:
          typeof c.name === "string" && c.name.length > 0
            ? c.name
            : "Untitled Category",
        emoji: typeof c.emoji === "string" ? c.emoji : "📁",
        color: typeof c.color === "string" ? c.color : undefined,
      };
      const parsed = CategorySchema.safeParse(candidate);
      return parsed.success ? parsed.data : null;
    })
    .filter((c): c is Category => c !== null);

  const bookmarks: Bookmark[] = rawBookmarks
    .map((entry): Bookmark | null => {
      if (!entry || typeof entry !== "object") return null;
      const b = entry as Record<string, unknown>;
      const candidate = {
        id: typeof b.id === "string" && b.id.length > 0 ? b.id : crypto.randomUUID(),
        title:
          (typeof b.title === "string" && b.title) ||
          (typeof b.name === "string" && b.name) ||
          "Untitled Bookmark",
        url: typeof b.url === "string" ? b.url : "",
        favicon: typeof b.favicon === "string" ? b.favicon : undefined,
        category:
          (typeof b.category === "string" && b.category) ||
          (typeof b.categoryId === "string" && b.categoryId) ||
          "other",
        isPinned: typeof b.isPinned === "boolean" ? b.isPinned : false,
        createdAt:
          (typeof b.createdAt === "number" && b.createdAt) ||
          (typeof b.lastUsed === "number" && b.lastUsed) ||
          Date.now(),
      };
      const parsed = BookmarkSchema.safeParse(candidate);
      return parsed.success ? parsed.data : null;
    })
    .filter((b): b is Bookmark => b !== null);

  if (bookmarks.length === 0 && categories.length === 0) {
    throw new Error("No valid entries found in file");
  }

  const { replaceAll, categories: existingCategories, bookmarks: existingBookmarks } =
    useBookmarksStore.getState();
  replaceAll({
    bookmarks: bookmarks.length > 0 ? bookmarks : existingBookmarks,
    categories: categories.length > 0 ? categories : existingCategories,
  });

  return { importedBookmarks: bookmarks.length, importedCategories: categories.length };
}

// ── Save current Chrome session as a category ──────────────────────────────

export async function saveCurrentSession(): Promise<{
  saved: number;
  category: Category;
}> {
  if (!hasTabsApi()) {
    throw new Error("Chrome tabs API unavailable");
  }
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const validTabs = tabs.filter(
    (t) => t.url && (t.url.startsWith("http://") || t.url.startsWith("https://")),
  );
  if (validTabs.length === 0) {
    throw new Error("No tabs to save");
  }

  const stamp = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const { addCategory, addBookmark } = useBookmarksStore.getState();
  const category = addCategory({
    name: `Session: ${stamp}`,
    emoji: "📦",
    color: "#8b5cf6",
  });

  let saved = 0;
  for (const tab of validTabs) {
    if (!tab.url || !tab.title) continue;
    addBookmark({
      title: tab.title,
      url: tab.url,
      category: category.id,
      isPinned: false,
    });
    saved += 1;
  }
  logger.info("[session] saved", saved, "tabs into category", category.id);
  return { saved, category };
}
