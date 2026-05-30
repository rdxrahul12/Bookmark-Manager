// Single source of truth for bookmarks + categories.
//
// Why Zustand?
//   * Stable per-action references — components subscribe with selectors and
//     skip rerenders when irrelevant slices change.
//   * No provider boilerplate, no Context recomputation cascade.
//   * Built-in persistence middleware lets us debounce writes and validate the
//     hydrated state with the same zod schemas used at runtime.
//
// All mutations are pure transitions over the previous state. Callers should
// use the hook (useBookmarksStore) plus a selector. Stable action references
// are exposed via useBookmarkActions for ergonomic destructuring.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { arrayMove } from "@dnd-kit/sortable";

import {
  Bookmark,
  Category,
  DEFAULT_CATEGORIES,
  SAMPLE_BOOKMARKS,
  BookmarkSchema,
  CategorySchema,
} from "@/types/bookmark";
import { logger } from "@/lib/logger";
import { prefetchIcon } from "@/utils/iconEngine";

const STORAGE_KEY = "bookmark-manager:state:v2";

interface BookmarksState {
  bookmarks: Bookmark[];
  categories: Category[];
  /** Internal — the user's lightweight in-memory revision counter. */
  rev: number;
}

interface BookmarksActions {
  addBookmark: (input: Omit<Bookmark, "id" | "createdAt">) => Bookmark;
  updateBookmark: (id: string, updates: Partial<Bookmark>) => void;
  deleteBookmark: (id: string) => void;
  restoreBookmark: (bookmark: Bookmark) => void;
  togglePin: (id: string) => void;

  addCategory: (input: Omit<Category, "id">) => Category;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  reorderBookmarks: (activeId: string, overId: string) => void;
  reorderCategories: (activeId: string, overId: string) => void;

  /** Replaces the whole state — used by import. */
  replaceAll: (next: Pick<BookmarksState, "bookmarks" | "categories">) => void;
  reset: () => void;
}

type Store = BookmarksState & BookmarksActions;

const initialState: BookmarksState = {
  bookmarks: SAMPLE_BOOKMARKS,
  categories: DEFAULT_CATEGORIES,
  rev: 0,
};

export const useBookmarksStore = create<Store>()(
  persist(
    (set) => ({
      ...initialState,

      addBookmark: (input) => {
        const newBookmark: Bookmark = {
          ...input,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        };
        set((state) => ({
          bookmarks: [...state.bookmarks, newBookmark],
          rev: state.rev + 1,
        }));
        // Eagerly resolve and persist this bookmark's icon so it appears
        // instantly in the grid. Fire-and-forget — never blocks the UI.
        prefetchIcon(newBookmark.url);
        return newBookmark;
      },

      updateBookmark: (id, updates) =>
        set((state) => {
          const existing = state.bookmarks.find((b) => b.id === id);
          // Trigger a prefetch if the URL was changed — the new origin may
          // have a different icon.
          if (existing && updates.url && updates.url !== existing.url) {
            prefetchIcon(updates.url);
          }
          return {
            bookmarks: state.bookmarks.map((b) =>
              b.id === id ? { ...b, ...updates } : b,
            ),
            rev: state.rev + 1,
          };
        }),

      deleteBookmark: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.id !== id),
          rev: state.rev + 1,
        })),

      restoreBookmark: (bookmark) =>
        set((state) => {
          if (state.bookmarks.some((b) => b.id === bookmark.id)) return state;
          return {
            bookmarks: [...state.bookmarks, bookmark],
            rev: state.rev + 1,
          };
        }),

      togglePin: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            b.id === id ? { ...b, isPinned: !b.isPinned } : b,
          ),
          rev: state.rev + 1,
        })),

      addCategory: (input) => {
        const newCategory: Category = {
          ...input,
          id: crypto.randomUUID(),
        };
        set((state) => ({
          categories: [...state.categories, newCategory],
          rev: state.rev + 1,
        }));
        return newCategory;
      },

      updateCategory: (id, updates) =>
        set((state) => ({
          categories: state.categories.map((c) =>
            c.id === id ? { ...c, ...updates } : c,
          ),
          rev: state.rev + 1,
        })),

      deleteCategory: (id) =>
        set((state) => ({
          // Cascade: bookmarks owned by this category are removed.
          bookmarks: state.bookmarks.filter((b) => b.category !== id),
          categories: state.categories.filter((c) => c.id !== id),
          rev: state.rev + 1,
        })),

      reorderBookmarks: (activeId, overId) =>
        set((state) => {
          const oldIndex = state.bookmarks.findIndex((b) => b.id === activeId);
          const newIndex = state.bookmarks.findIndex((b) => b.id === overId);
          if (oldIndex === -1 || newIndex === -1) return state;
          return {
            bookmarks: arrayMove(state.bookmarks, oldIndex, newIndex),
            rev: state.rev + 1,
          };
        }),

      reorderCategories: (activeId, overId) =>
        set((state) => {
          const oldIndex = state.categories.findIndex((c) => c.id === activeId);
          const newIndex = state.categories.findIndex((c) => c.id === overId);
          if (oldIndex === -1 || newIndex === -1) return state;
          return {
            categories: arrayMove(state.categories, oldIndex, newIndex),
            rev: state.rev + 1,
          };
        }),

      replaceAll: ({ bookmarks, categories }) =>
        set((state) => ({
          bookmarks,
          categories,
          rev: state.rev + 1,
        })),

      reset: () =>
        set(() => ({
          ...initialState,
          rev: 0,
        })),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Only persist the data, never persist actions or revision counters.
      partialize: (state) => ({
        bookmarks: state.bookmarks,
        categories: state.categories,
      }),
      // Validate the hydrated payload — corrupted data falls back to defaults
      // instead of crashing the new-tab page.
      merge: (persistedState, current) => {
        const fallback = { ...current };
        if (!persistedState || typeof persistedState !== "object") return fallback;

        const raw = persistedState as { bookmarks?: unknown; categories?: unknown };
        const safeBookmarks = Array.isArray(raw.bookmarks)
          ? raw.bookmarks
              .map((b) => BookmarkSchema.safeParse(b))
              .filter((r): r is { success: true; data: Bookmark } => r.success)
              .map((r) => r.data)
          : null;
        const safeCategories = Array.isArray(raw.categories)
          ? raw.categories
              .map((c) => CategorySchema.safeParse(c))
              .filter((r): r is { success: true; data: Category } => r.success)
              .map((r) => r.data)
          : null;

        return {
          ...current,
          bookmarks: safeBookmarks && safeBookmarks.length > 0 ? safeBookmarks : current.bookmarks,
          categories: safeCategories && safeCategories.length > 0 ? safeCategories : current.categories,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) logger.warn("[bookmarks-store] rehydrate error", error);
      },
      // Migrate from earlier persistence keys / shapes.
      migrate: (state) => state as Partial<Store>,
    },
  ),
);

// Selectors and action accessors. Components should prefer these over
// reading the entire store, to keep rerenders surgical.

export const useBookmarks = () => useBookmarksStore((s) => s.bookmarks);
export const useCategories = () => useBookmarksStore((s) => s.categories);

// useShallow ensures consumers only re-render when one of the picked references
// actually changes. Action references in Zustand are stable for the lifetime of
// the store, so this hook effectively returns a frozen object.
export const useBookmarkActions = () =>
  useBookmarksStore(
    useShallow((s) => ({
      addBookmark: s.addBookmark,
      updateBookmark: s.updateBookmark,
      deleteBookmark: s.deleteBookmark,
      restoreBookmark: s.restoreBookmark,
      togglePin: s.togglePin,
      addCategory: s.addCategory,
      updateCategory: s.updateCategory,
      deleteCategory: s.deleteCategory,
      reorderBookmarks: s.reorderBookmarks,
      reorderCategories: s.reorderCategories,
      replaceAll: s.replaceAll,
      reset: s.reset,
    })),
  );
