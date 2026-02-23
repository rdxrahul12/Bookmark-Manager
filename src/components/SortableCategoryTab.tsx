import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Category } from "@/types/bookmark";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";

interface SortableCategoryTabProps {
    category: Category;
    selectedCategory: string | null;
    dragOverId: string | null;
    index: number;
    onSelectCategory: (id: string | null) => void;
    onDragOver: (e: React.DragEvent, id: string) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent, id: string) => void;
    confirmDelete: (category: Category) => void;
}

export function SortableCategoryTab({
    category,
    selectedCategory,
    dragOverId,
    index,
    onSelectCategory,
    onDragOver,
    onDragLeave,
    onDrop,
    confirmDelete,
}: SortableCategoryTabProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: category.id });
    const { animationMultiplier } = useUiPreferences();

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 1,
        opacity: isDragging ? 0.8 : 1,
        position: "relative" as const,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="relative group"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                    type: "spring",
                    stiffness: 300 / animationMultiplier,
                    damping: 20,
                    delay: index * 0.03 * animationMultiplier,
                }}
            >
                <motion.div
                    onClick={() => onSelectCategory(category.id)}
                    onDragOver={(e) => onDragOver(e, category.id)}
                    onDragLeave={onDragLeave}
                    onDrop={(e) => onDrop(e, category.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all cursor-pointer ${dragOverId === category.id
                        ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 scale-110"
                        : selectedCategory === category.id
                            ? "bg-primary text-primary-foreground glow-primary"
                            : "bg-card neu-raised-sm text-foreground"
                        }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400 / animationMultiplier, damping: 17 }}
                >
                    <span>{category.name}</span>
                </motion.div>

                {/* Delete button - appears on hover */}
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(category);
                    }}
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-50 hover:scale-110 active:scale-90"
                >
                    <X className="h-3 w-3" />
                </div>
            </motion.div>
        </div>
    );
}
