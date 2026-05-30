import { memo, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";

import { Category } from "@/types/bookmark";
import { SortableCategoryTab } from "./SortableCategoryTab";
import { ConfirmationModal } from "./ConfirmationModal";
import { useAnimationMultiplier } from "@/stores/uiPrefsStore";

interface CategoryFilterProps {
  categories: Category[];
  selectedCategory: string | null;
  onSelectCategory: (id: string | null) => void;
  onAddCategory: () => void;
  onDeleteCategory: (id: string) => void;
  onDropUrl: (url: string, categoryId: string) => void;
}

function CategoryFilterImpl({
  categories,
  selectedCategory,
  onSelectCategory,
  onAddCategory,
  onDeleteCategory,
  onDropUrl,
}: CategoryFilterProps) {
  const animationMultiplier = useAnimationMultiplier();
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  const handleSelect = useCallback(
    (id: string) => {
      // Toggle off when re-clicking the active category for "show all".
      onSelectCategory(selectedCategory === id ? null : id);
    },
    [onSelectCategory, selectedCategory],
  );

  const handleSelectAll = useCallback(() => {
    onSelectCategory(null);
  }, [onSelectCategory]);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOverId(id);
  }, []);

  const handleDragLeave = useCallback(() => setDragOverId(null), []);

  const handleDrop = useCallback(
    (e: React.DragEvent, id: string) => {
      e.preventDefault();
      setDragOverId(null);
      const url =
        e.dataTransfer.getData("text/uri-list") ||
        e.dataTransfer.getData("text/plain") ||
        e.dataTransfer.getData("text");
      if (url && url.startsWith("http")) onDropUrl(url.trim(), id);
    },
    [onDropUrl],
  );

  const handleRequestDelete = useCallback((category: Category) => {
    setPendingDelete(category);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (pendingDelete) onDeleteCategory(pendingDelete.id);
    setPendingDelete(null);
  }, [pendingDelete, onDeleteCategory]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3" role="tablist" aria-label="Bookmark categories">
        <motion.button
          type="button"
          onClick={handleSelectAll}
          aria-pressed={selectedCategory === null}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
            selectedCategory === null
              ? "bg-primary text-primary-foreground glow-primary"
              : "bg-card neu-raised-sm text-foreground"
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 400 / animationMultiplier,
            damping: 17,
          }}
        >
          All
        </motion.button>

        <SortableContext
          items={categories.map((c) => c.id)}
          strategy={horizontalListSortingStrategy}
        >
          {categories.map((category, index) => (
            <SortableCategoryTab
              key={category.id}
              category={category}
              selected={selectedCategory === category.id}
              isDropTarget={dragOverId === category.id}
              index={index}
              onSelect={handleSelect}
              onDragOverCategory={handleDragOver}
              onDragLeaveCategory={handleDragLeave}
              onDropOnCategory={handleDrop}
              onRequestDelete={handleRequestDelete}
            />
          ))}
        </SortableContext>

        <motion.button
          type="button"
          onClick={onAddCategory}
          aria-label="Add new category"
          className="h-9 w-9 rounded-xl bg-card neu-raised-sm flex items-center justify-center text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          transition={{
            type: "spring",
            stiffness: 300 / animationMultiplier,
            damping: 15,
          }}
        >
          <Plus className="h-5 w-5" />
        </motion.button>
      </div>

      <ConfirmationModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Category?"
        description={`Are you sure you want to delete "${pendingDelete?.name}"? All bookmarks in this category will also be permanently deleted.`}
        confirmText="Delete Category"
      />
    </>
  );
}

export const CategoryFilter = memo(CategoryFilterImpl);
CategoryFilter.displayName = "CategoryFilter";
