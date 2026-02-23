/// <reference types="chrome"/>
import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useTheme } from "@/hooks/useTheme";
import { Header } from "@/components/Header";
import { CategoryFilter } from "@/components/CategoryFilter";
import { ActionBar } from "@/components/ActionBar";
import { BookmarkGrid } from "@/components/BookmarkGrid";
import { AddBookmarkModal } from "@/components/AddBookmarkModal";
import { AddCategoryModal } from "@/components/AddCategoryModal";
import { Bookmark } from "@/types/bookmark";
import { useToast } from "@/hooks/use-toast";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

const Index = () => {
  const { theme, toggleTheme } = useTheme();
  const {
    bookmarks,
    categories,
    isLoaded,
    addBookmark,
    updateBookmark,
    deleteBookmark,
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
    restoreBookmark,
  } = useBookmarks();
  const { toast } = useToast();
  const { animationMultiplier } = useUiPreferences();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isAddBookmarkOpen, setIsAddBookmarkOpen] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);

  const filteredBookmarks = useMemo(() => {
    return getBookmarksByCategory(selectedCategory);
  }, [getBookmarksByCategory, selectedCategory]);

  const pinnedBookmarks = useMemo(() => {
    return getPinnedBookmarks();
  }, [getPinnedBookmarks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    // Check if we are dragging a bookmark (they have UUIDs or long IDs, whereas categories are specific IDs)
    // Actually, a safer way is to check if the active item exists in bookmarks or categories.
    const isBookmark = bookmarks.some(b => b.id === active.id);
    const isCategory = categories.some(c => c.id === active.id);

    if (isBookmark) {
      reorderBookmarks(active.id.toString(), over.id.toString());
    } else if (isCategory) {
      reorderCategories(active.id.toString(), over.id.toString());
    }
  };

  const handleSaveBookmark = (bookmark: Omit<Bookmark, "id" | "createdAt">) => {
    if (editingBookmark) {
      const originalBookmark = editingBookmark;
      updateBookmark(editingBookmark.id, bookmark);
      toast({
        title: "Bookmark updated!",
        description: `"${bookmark.title}" has been updated.`,
        action: (
          <button
            onClick={() => updateBookmark(originalBookmark.id, originalBookmark)}
            className="bg-primary text-primary-foreground px-3 py-1 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Undo
          </button>
        ),
      });
    } else {
      addBookmark(bookmark);
      toast({
        title: "Bookmark added!",
        description: `"${bookmark.title}" has been added to your collection.`,
      });
    }
    setEditingBookmark(null);
  };

  const handleEditBookmark = (bookmark: Bookmark) => {
    setEditingBookmark(bookmark);
    setIsAddBookmarkOpen(true);
  };

  const handleDeleteBookmark = (id: string) => {
    const bookmark = bookmarks.find((b) => b.id === id);
    deleteBookmark(id);
    toast({
      title: "Bookmark deleted",
      description: bookmark ? `"${bookmark.title}" has been removed.` : "Bookmark removed.",
      action: bookmark ? (
        <button
          onClick={() => restoreBookmark(bookmark)}
          className="bg-primary text-primary-foreground px-3 py-1 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Undo
        </button>
      ) : undefined,
    });
  };

  const handleAddCategory = (category: { name: string; emoji: string }) => {
    addCategory(category);
    toast({
      title: "Category added!",
      description: `"${category.name}" is now available.`,
    });
  };

  const handleDeleteCategory = (id: string) => {
    const category = categories.find((c) => c.id === id);
    deleteCategory(id);
    toast({
      title: "Category deleted",
      description: category ? `"${category.name}" has been removed.` : "Category removed.",
    });
  };

  const handleDropUrl = (url: string, categoryId: string) => {
    try {
      const urlObj = new URL(url);
      const title = urlObj.hostname.replace("www.", "").split(".")[0];
      const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
      addBookmark({
        title: capitalizedTitle,
        url: url,
        category: categoryId,
        isPinned: false,
      });
      toast({
        title: "Bookmark added!",
        description: `"${capitalizedTitle}" added via drag & drop.`,
      });
    } catch {
      toast({
        title: "Invalid URL",
        description: "Could not add the dropped link.",
        variant: "destructive",
      });
    }
  };

  const handleImport = async (file: File) => {
    try {
      await importData(file);
      toast({
        title: "Import successful!",
        description: "Your bookmarks have been imported.",
      });
    } catch {
      toast({
        title: "Import failed",
        description: "The file format was invalid.",
        variant: "destructive",
      });
    }
  };

  const handleExport = () => {
    exportData();
    toast({
      title: "Export successful!",
      description: "Your bookmarks have been downloaded.",
    });
  };

  const handleSaveSession = async () => {
    if (!chrome?.tabs?.query) {
      toast({
        title: "Feature unavailable",
        description: "Must be run as a generic Chrome Extension.",
        variant: "destructive"
      });
      return;
    }

    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const validTabs = tabs.filter(t => t.url && (t.url.startsWith('http://') || t.url.startsWith('https://')));

      if (validTabs.length === 0) {
        toast({
          title: "No tabs found",
          description: "There are no valid tabs to save.",
        });
        return;
      }

      const dateStr = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });

      const newCategory = addCategory({
        name: `Session: ${dateStr}`,
        emoji: "📦",
        color: "#8b5cf6" // Purple for sessions
      });

      let addedCount = 0;
      validTabs.forEach(tab => {
        if (tab.url && tab.title) {
          addBookmark({
            title: tab.title,
            url: tab.url,
            category: newCategory.id,
            isPinned: false
          });
          addedCount++;
        }
      });

      toast({
        title: "Session Saved!",
        description: `Successfully saved ${addedCount} tabs to a new category.`,
      });

    } catch (e) {
      console.error(e);
      toast({
        title: "Error saving session",
        description: "Something went wrong while capturing tabs.",
        variant: "destructive"
      });
    }
  };

  // Reset editing state when modal closes
  useEffect(() => {
    if (!isAddBookmarkOpen) {
      setEditingBookmark(null);
    }
  }, [isAddBookmarkOpen]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          className="h-16 w-16 rounded-full bg-primary"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1 * animationMultiplier }}
        />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="min-h-screen bg-background p-2">
        <div className="max-w-7xl mx-auto space-y-5">
          {/* Header */}
          <Header
            theme={theme}
            onToggleTheme={toggleTheme}
            pinnedBookmarks={pinnedBookmarks}
            onExport={handleExport}
            onImport={handleImport}
            categories={categories}
            onUpdateCategory={updateCategory}
          />

          {/* Category Filter + Actions Row */}
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
              onReorderCategory={reorderCategories}
            />
            <ActionBar
              onAddBookmark={() => setIsAddBookmarkOpen(true)}
              onSaveSession={handleSaveSession}
            />
          </motion.div>

          {/* Bookmark Grid */}
          <motion.div
            className="p-4 md:p-6 rounded-2xl bg-background neu-raised"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.2 }}
          >
            <BookmarkGrid
              bookmarks={filteredBookmarks}
              categories={categories}
              onEdit={handleEditBookmark}
              onDelete={handleDeleteBookmark}
              onTogglePin={togglePin}
              onReorder={(activeId: string, overId: string) => reorderBookmarks(activeId, overId)}
            />
          </motion.div>

          {/* Mobile Quick Access */}
          <motion.div
            className="lg:hidden p-4 rounded-2xl bg-background neu-raised"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.3 }}
          >
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Quick Access</h3>
            <div className="flex flex-wrap gap-2">
              {pinnedBookmarks.map((bookmark) => (
                <motion.a
                  key={bookmark.id}
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-10 w-10 rounded-lg bg-background neu-raised-sm flex items-center justify-center"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=64`}
                    alt={bookmark.title}
                    className="h-5 w-5"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/placeholder.svg";
                    }}
                  />
                </motion.a>
              ))}
              {pinnedBookmarks.length === 0 && (
                <p className="text-sm text-muted-foreground">Pin bookmarks to see them here</p>
              )}
            </div>
          </motion.div>
        </div>

        {/* Modals */}
        <AddBookmarkModal
          isOpen={isAddBookmarkOpen}
          onClose={() => setIsAddBookmarkOpen(false)}
          onSave={handleSaveBookmark}
          categories={categories}
          editingBookmark={editingBookmark}
        />
        <AddCategoryModal
          isOpen={isAddCategoryOpen}
          onClose={() => setIsAddCategoryOpen(false)}
          onSave={handleAddCategory}
        />
      </div>
    </DndContext>
  );
};

export default Index;
