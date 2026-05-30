import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import { Bookmark } from "@/types/bookmark";
import {
  useBookmarks,
  useCategories,
  useBookmarkActions,
} from "@/stores/bookmarksStore";
import {
  exportData as exportDataOp,
  importData as importDataOp,
  saveCurrentSession,
} from "@/stores/bookmarksOps";
import { hasTabsApi } from "@/lib/env";
import { useTheme } from "@/stores/themeStore";
import { useToast } from "@/hooks/use-toast";
import { tryParseUrl, deriveTitleFromUrl } from "@/lib/url";

import { Header } from "@/components/Header";
import { CategoryFilter } from "@/components/CategoryFilter";
import { ActionBar } from "@/components/ActionBar";
import { BookmarkGrid } from "@/components/BookmarkGrid";
import { SearchOverlay } from "@/components/SearchOverlay";
import { MobileQuickAccess } from "@/components/MobileQuickAccess";

// Modals are opened on-demand only — splitting them off shrinks the initial chunk.
const AddBookmarkModal = lazy(() =>
  import("@/components/AddBookmarkModal").then((m) => ({ default: m.AddBookmarkModal })),
);
const AddCategoryModal = lazy(() =>
  import("@/components/AddCategoryModal").then((m) => ({ default: m.AddCategoryModal })),
);

const Index = () => {
  const { theme, toggleTheme } = useTheme();
  const bookmarks = useBookmarks();
  const categories = useCategories();
  const {
    addBookmark,
    updateBookmark,
    deleteBookmark,
    togglePin,
    addCategory,
    deleteCategory,
    reorderBookmarks,
    reorderCategories,
    restoreBookmark,
  } = useBookmarkActions();
  const { toast } = useToast();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isAddBookmarkOpen, setIsAddBookmarkOpen] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Global ⌘K / Ctrl+K toggles the search overlay from anywhere on the
  // page. Lives at the page root so the shortcut works whether or not
  // the header has keyboard focus.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Derived data — recomputed only when inputs change.
  const filteredBookmarks = useMemo(() => {
    if (!selectedCategory) return bookmarks;
    return bookmarks.filter((b) => b.category === selectedCategory);
  }, [bookmarks, selectedCategory]);

  const pinnedBookmarks = useMemo(
    () => bookmarks.filter((b) => b.isPinned),
    [bookmarks],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = active.id.toString();
      const overId = over.id.toString();

      if (bookmarks.some((b) => b.id === activeId)) {
        reorderBookmarks(activeId, overId);
      } else if (categories.some((c) => c.id === activeId)) {
        reorderCategories(activeId, overId);
      }
    },
    [bookmarks, categories, reorderBookmarks, reorderCategories],
  );

  // ── Modal-driven handlers ────────────────────────────────────────────────

  const handleSaveBookmark = useCallback(
    (input: Omit<Bookmark, "id" | "createdAt">) => {
      if (editingBookmark) {
        const original = editingBookmark;
        updateBookmark(original.id, input);
        toast({
          title: "Bookmark updated!",
          description: `"${input.title}" has been updated.`,
          action: (
            <button
              type="button"
              onClick={() => updateBookmark(original.id, original)}
              className="bg-primary text-primary-foreground px-3 py-1 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Undo
            </button>
          ),
        });
      } else {
        addBookmark(input);
        toast({
          title: "Bookmark added!",
          description: `"${input.title}" has been added to your collection.`,
        });
      }
      setEditingBookmark(null);
    },
    [editingBookmark, addBookmark, updateBookmark, toast],
  );

  const handleEditBookmark = useCallback((bookmark: Bookmark) => {
    setEditingBookmark(bookmark);
    setIsAddBookmarkOpen(true);
  }, []);

  const handleDeleteBookmark = useCallback(
    (id: string) => {
      const bookmark = bookmarks.find((b) => b.id === id);
      deleteBookmark(id);
      toast({
        title: "Bookmark deleted",
        description: bookmark
          ? `"${bookmark.title}" has been removed.`
          : "Bookmark removed.",
        action: bookmark ? (
          <button
            type="button"
            onClick={() => restoreBookmark(bookmark)}
            className="bg-primary text-primary-foreground px-3 py-1 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Undo
          </button>
        ) : undefined,
      });
    },
    [bookmarks, deleteBookmark, restoreBookmark, toast],
  );

  const handleAddCategory = useCallback(
    (input: { name: string; emoji: string }) => {
      addCategory(input);
      toast({
        title: "Category added!",
        description: `"${input.name}" is now available.`,
      });
    },
    [addCategory, toast],
  );

  const handleDeleteCategory = useCallback(
    (id: string) => {
      const category = categories.find((c) => c.id === id);
      deleteCategory(id);
      toast({
        title: "Category deleted",
        description: category
          ? `"${category.name}" has been removed.`
          : "Category removed.",
      });
    },
    [categories, deleteCategory, toast],
  );

  const handleDropUrl = useCallback(
    (url: string, categoryId: string) => {
      const parsed = tryParseUrl(url);
      if (!parsed) {
        toast({
          title: "Invalid URL",
          description: "Could not add the dropped link.",
          variant: "destructive",
        });
        return;
      }
      const title = deriveTitleFromUrl(url);
      addBookmark({ title, url, category: categoryId, isPinned: false });
      toast({
        title: "Bookmark added!",
        description: `"${title}" added via drag & drop.`,
      });
    },
    [addBookmark, toast],
  );

  const handleImport = useCallback(
    async (file: File) => {
      try {
        const { importedBookmarks, importedCategories } = await importDataOp(file);
        toast({
          title: "Import successful!",
          description: `Imported ${importedBookmarks} bookmarks and ${importedCategories} categories.`,
        });
      } catch (err) {
        toast({
          title: "Import failed",
          description: err instanceof Error ? err.message : "The file format was invalid.",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const handleExport = useCallback(() => {
    exportDataOp();
    toast({
      title: "Export successful!",
      description: "Your bookmarks have been downloaded.",
    });
  }, [toast]);

  const handleSaveSession = useCallback(async () => {
    try {
      const { saved } = await saveCurrentSession();
      toast({
        title: "Session Saved!",
        description: `Successfully saved ${saved} tab${saved === 1 ? "" : "s"} to a new category.`,
      });
    } catch (err) {
      toast({
        title: "Couldn't save session",
        description:
          err instanceof Error ? err.message : "Run inside the Chrome extension to enable this.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Reset edit state when the modal closes for any reason.
  useEffect(() => {
    if (!isAddBookmarkOpen) setEditingBookmark(null);
  }, [isAddBookmarkOpen]);

  const onSaveSession = hasTabsApi() ? handleSaveSession : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-background px-2 py-2 sm:px-4 md:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1600px] space-y-4 sm:space-y-5">
          <Header
            theme={theme}
            onToggleTheme={toggleTheme}
            pinnedBookmarks={pinnedBookmarks}
            onExport={handleExport}
            onImport={handleImport}
            onOpenSearch={() => setIsSearchOpen(true)}
          />

          {/* Pinned strip — visible whenever there are pins and the header
              isn't already showing them inline (i.e. below lg). Lives near
              the top so it's always in view, never below the fold. */}
          {pinnedBookmarks.length > 0 && (
            <MobileQuickAccess bookmarks={pinnedBookmarks} />
          )}

          <motion.div
            className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-background neu-raised"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.1 }}
          >
            <CategoryFilter
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              onAddCategory={() => setIsAddCategoryOpen(true)}
              onDeleteCategory={handleDeleteCategory}
              onDropUrl={handleDropUrl}
            />
            <ActionBar
              onAddBookmark={() => setIsAddBookmarkOpen(true)}
              onSaveSession={onSaveSession}
            />
          </motion.div>

          <motion.div
            className="p-4 md:p-6 rounded-2xl bg-background neu-raised"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.2 }}
          >
            <BookmarkGrid
              bookmarks={filteredBookmarks}
              onEdit={handleEditBookmark}
              onDelete={handleDeleteBookmark}
              onTogglePin={togglePin}
            />
          </motion.div>
        </div>

        <Suspense fallback={null}>
          {(isAddBookmarkOpen || editingBookmark) && (
            <AddBookmarkModal
              isOpen={isAddBookmarkOpen}
              onClose={() => setIsAddBookmarkOpen(false)}
              onSave={handleSaveBookmark}
              categories={categories}
              editingBookmark={editingBookmark}
            />
          )}
          {isAddCategoryOpen && (
            <AddCategoryModal
              isOpen={isAddCategoryOpen}
              onClose={() => setIsAddCategoryOpen(false)}
              onSave={handleAddCategory}
            />
          )}
        </Suspense>

        {/* Spotlight-style global search — portaled, blurs the page
            beneath itself, ⌘K-toggle from anywhere. */}
        <SearchOverlay
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          bookmarks={bookmarks}
          categories={categories}
        />
      </div>
    </DndContext>
  );
};

export default Index;
