import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Category } from "@/types/bookmark";
import { useState } from "react";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableCategoryTab } from "./SortableCategoryTab";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";

interface CategoryFilterProps {
  categories: Category[];
  selectedCategory: string | null;
  onSelectCategory: (id: string | null) => void;
  onAddCategory: () => void;
  onDeleteCategory: (id: string) => void;
  onDropUrl?: (url: string, categoryId: string) => void;
  onReorderCategory?: (activeId: string, overId: string) => void;
}

import { ConfirmationModal } from "./ConfirmationModal";

export function CategoryFilter({
  categories,
  selectedCategory,
  onSelectCategory,
  onAddCategory,
  onDeleteCategory,
  onDropUrl,
  onReorderCategory,
}: CategoryFilterProps) {
  const { animationMultiplier } = useUiPreferences();
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  const handleDragOver = (e: React.DragEvent, categoryId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOverId(categoryId);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, categoryId: string) => {
    e.preventDefault();
    setDragOverId(null);

    // Try to get URL from various data types
    const url = e.dataTransfer.getData("text/uri-list")
      || e.dataTransfer.getData("text/plain")
      || e.dataTransfer.getData("text");

    if (url && onDropUrl && url.startsWith("http")) {
      onDropUrl(url.trim(), categoryId);
    }
  };

  const confirmDelete = (category: Category) => {
    setCategoryToDelete(category);
    setDeleteModalOpen(true);
  };

  const handleDelete = () => {
    if (categoryToDelete) {
      onDeleteCategory(categoryToDelete.id);
    }
    setDeleteModalOpen(false);
    setCategoryToDelete(null);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {/* All button */}
        <motion.button
          onClick={() => onSelectCategory(null)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${selectedCategory === null
            ? "bg-primary text-primary-foreground glow-primary"
            : "bg-card neu-raised-sm text-foreground"
            }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400 / animationMultiplier, damping: 17 }}
        >
          All
        </motion.button>

        {/* Category pills */}
        <SortableContext items={categories.map(c => c.id)} strategy={horizontalListSortingStrategy}>
          {categories.map((category, index) => (
            <SortableCategoryTab
              key={category.id}
              category={category}
              selectedCategory={selectedCategory}
              dragOverId={dragOverId}
              index={index}
              onSelectCategory={onSelectCategory}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              confirmDelete={confirmDelete}
            />
          ))}
        </SortableContext>

        {/* Add category button */}
        <motion.button
          onClick={onAddCategory}
          className="h-9 w-9 rounded-xl bg-card neu-raised-sm flex items-center justify-center text-primary"
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: "spring", stiffness: 300 / animationMultiplier, damping: 15 }}
        >
          <Plus className="h-5 w-5" />
        </motion.button>
      </div>

      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Category?"
        description={`Are you sure you want to delete "${categoryToDelete?.name}"? All bookmarks in this category will also be permanently deleted.`}
        confirmText="Delete Category"
      />
    </>
  );
}
