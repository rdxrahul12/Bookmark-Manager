import { useState, useEffect, useCallback } from "react";
import { Bookmark, Category, DEFAULT_CATEGORIES, SAMPLE_BOOKMARKS } from "@/types/bookmark";
import { arrayMove } from "@dnd-kit/sortable";

const BOOKMARKS_KEY = "bookmark-manager-bookmarks";
const CATEGORIES_KEY = "bookmark-manager-categories";

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const storedBookmarks = localStorage.getItem(BOOKMARKS_KEY);
    const storedCategories = localStorage.getItem(CATEGORIES_KEY);

    if (storedBookmarks) {
      setBookmarks(JSON.parse(storedBookmarks));
    } else {
      setBookmarks(SAMPLE_BOOKMARKS);
    }

    if (storedCategories) {
      setCategories(JSON.parse(storedCategories));
    } else {
      setCategories(DEFAULT_CATEGORIES);
    }

    setIsLoaded(true);
  }, []);

  // Sync bookmarks to localStorage whenever they change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    }
  }, [bookmarks, isLoaded]);

  // Sync categories to localStorage whenever they change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
    }
  }, [categories, isLoaded]);

  const addBookmark = useCallback((bookmark: Omit<Bookmark, "id" | "createdAt">) => {
    const newBookmark: Bookmark = {
      ...bookmark,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    setBookmarks((prev) => [...prev, newBookmark]);

    return newBookmark;
  }, []);

  const updateBookmark = useCallback((id: string, updates: Partial<Bookmark>) => {
    setBookmarks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
    );
  }, []);

  const deleteBookmark = useCallback((id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const restoreBookmark = useCallback((bookmark: Bookmark) => {
    setBookmarks((prev) => {
      // Prevent duplicates if restore is called multiple times or race conditions
      if (prev.some((b) => b.id === bookmark.id)) {
        return prev;
      }
      return [...prev, bookmark];
    });
  }, []);

  const togglePin = useCallback((id: string) => {
    setBookmarks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, isPinned: !b.isPinned } : b))
    );
  }, []);

  const addCategory = useCallback((category: Omit<Category, "id">) => {
    const newCategory: Category = {
      ...category,
      id: crypto.randomUUID(),
    };
    setCategories((prev) => [...prev, newCategory]);
    return newCategory;
  }, []);

  const updateCategory = useCallback((id: string, updates: Partial<Category>) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }, []);

  const deleteCategory = useCallback((id: string) => {
    // Delete all bookmarks in this category
    setBookmarks((prev) => prev.filter((b) => b.category !== id));
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const reorderBookmarks = useCallback((activeId: string, overId: string) => {
    setBookmarks((prev) => {
      const oldIndex = prev.findIndex((b) => b.id === activeId);
      const newIndex = prev.findIndex((b) => b.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const reorderCategories = useCallback((activeId: string, overId: string) => {
    setCategories((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === activeId);
      const newIndex = prev.findIndex((c) => c.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const exportData = useCallback(() => {
    // Map internal state back to external format
    const externalBookmarks = bookmarks.map(b => ({
      id: b.id,
      name: b.title, // Map 'title' -> 'name'
      url: b.url,
      categoryId: b.category, // Map 'category' -> 'categoryId'
      usageCount: 0, // Default or track if possible
      lastUsed: b.createdAt // Map 'createdAt' -> 'lastUsed'
    }));

    const externalCategories = categories.map(c => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      color: c.color
    }));

    const data = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      categories: externalCategories,
      bookmarks: externalBookmarks,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookmarks-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [bookmarks, categories]);

  const importData = useCallback((file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const rawData = JSON.parse(e.target?.result as string);

          let importedBookmarks: unknown[] = [];
          let importedCategories: unknown[] = [];

          // Determine structure
          if (Array.isArray(rawData)) {
            // Legacy array format of just bookmarks
            importedBookmarks = rawData;
          } else {
            // Object format (legacy or new versioned)
            importedBookmarks = Array.isArray(rawData.bookmarks) ? rawData.bookmarks : [];
            importedCategories = Array.isArray(rawData.categories) ? rawData.categories : [];
          }

          // Map and validate Categories
          const validCategories: Category[] = (importedCategories as Record<string, unknown>[]).map((c) => ({
            id: (c.id as string) || crypto.randomUUID(),
            name: (c.name as string) || "Untitled Category",
            emoji: (c.emoji as string) || "📁",
            color: c.color as string | undefined
          }));

          // Map and validate Bookmarks
          const validBookmarks: Bookmark[] = (importedBookmarks as Record<string, unknown>[]).map((b) => ({
            id: (b.id as string) || crypto.randomUUID(),
            title: (b.title || b.name || "Untitled Bookmark") as string,
            url: (b.url as string) || "",
            favicon: b.favicon as string | undefined,
            category: (b.category || b.categoryId || "other") as string,
            isPinned: (b.isPinned as boolean) || false,
            createdAt: (b.createdAt || b.lastUsed || Date.now()) as number,
          }));

          if (validBookmarks.length > 0) setBookmarks(validBookmarks);
          if (validCategories.length > 0) setCategories(validCategories);

          resolve();
        } catch (error) {
          console.error("Import failed:", error);
          reject(new Error("Invalid file format"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }, []);

  const getPinnedBookmarks = useCallback(() => {
    return bookmarks.filter((b) => b.isPinned);
  }, [bookmarks]);

  const getBookmarksByCategory = useCallback((categoryId: string | null) => {
    if (!categoryId) return bookmarks;
    return bookmarks.filter((b) => b.category === categoryId);
  }, [bookmarks]);

  return {
    bookmarks,
    categories,
    isLoaded,
    addBookmark,
    updateBookmark,
    deleteBookmark,
    restoreBookmark,
    togglePin,
    addCategory,
    updateCategory,
    deleteCategory,
    exportData,
    importData,
    getPinnedBookmarks,
    reorderBookmarks,
    reorderCategories,
    getBookmarksByCategory,
  };
}
