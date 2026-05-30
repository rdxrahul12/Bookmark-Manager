import { memo, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { X } from "lucide-react";

import { Category } from "@/types/bookmark";
import { useAnimationMultiplier } from "@/stores/uiPrefsStore";

interface SortableCategoryTabProps {
  category: Category;
  selected: boolean;
  isDropTarget: boolean;
  index: number;
  onSelect: (id: string) => void;
  onDragOverCategory: (e: React.DragEvent, id: string) => void;
  onDragLeaveCategory: () => void;
  onDropOnCategory: (e: React.DragEvent, id: string) => void;
  onRequestDelete: (category: Category) => void;
}

function SortableCategoryTabImpl({
  category,
  selected,
  isDropTarget,
  index,
  onSelect,
  onDragOverCategory,
  onDragLeaveCategory,
  onDropOnCategory,
  onRequestDelete,
}: SortableCategoryTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.id });
  const animationMultiplier = useAnimationMultiplier();

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.8 : 1,
    position: "relative",
  };

  const handleSelect = useCallback(() => onSelect(category.id), [category.id, onSelect]);
  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleSelect();
      }
    },
    [handleSelect],
  );
  const handleDragOver = useCallback(
    (e: React.DragEvent) => onDragOverCategory(e, category.id),
    [category.id, onDragOverCategory],
  );
  const handleDrop = useCallback(
    (e: React.DragEvent) => onDropOnCategory(e, category.id),
    [category.id, onDropOnCategory],
  );
  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRequestDelete(category);
    },
    [category, onRequestDelete],
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative group"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 300 / animationMultiplier,
          damping: 20,
          delay: index * 0.03 * animationMultiplier,
        }}
      >
        <div
          role="tab"
          aria-selected={selected}
          tabIndex={0}
          onClick={handleSelect}
          onKeyDown={handleKey}
          onDragOver={handleDragOver}
          onDragLeave={onDragLeaveCategory}
          onDrop={handleDrop}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
            isDropTarget
              ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 scale-110"
              : selected
                ? "bg-primary text-primary-foreground glow-primary"
                : "bg-card neu-raised-sm text-foreground"
          }`}
        >
          {category.emoji && <span aria-hidden>{category.emoji}</span>}
          <span>{category.name}</span>
        </div>

        <button
          type="button"
          onClick={handleDeleteClick}
          aria-label={`Delete category ${category.name}`}
          className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity z-50 hover:scale-110 active:scale-90"
        >
          <X className="h-3 w-3" />
        </button>
      </motion.div>
    </div>
  );
}

export const SortableCategoryTab = memo(SortableCategoryTabImpl);
SortableCategoryTab.displayName = "SortableCategoryTab";
