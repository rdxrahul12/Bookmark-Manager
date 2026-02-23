import { AnimatePresence } from "framer-motion";
import { Bookmark, Category } from "@/types/bookmark";
import { SortableBookmarkCard } from "./SortableBookmarkCard";
import {
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

interface BookmarkGridProps {
  bookmarks: Bookmark[];
  categories: Category[];
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
}

export function BookmarkGrid({
  bookmarks,
  categories,
  onEdit,
  onDelete,
  onTogglePin,
  onReorder,
}: BookmarkGridProps) {
  const getCategoryById = (id: string) => categories.find((c) => c.id === id);

  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <div className="text-6xl mb-4">📚</div>
        <p className="text-lg font-medium">No bookmarks yet</p>
        <p className="text-sm">Add your first bookmark to get started!</p>
      </div>
    );
  }

  return (
    <SortableContext items={bookmarks.map((b) => b.id)} strategy={rectSortingStrategy}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <AnimatePresence mode="popLayout">
          {bookmarks.map((bookmark, index) => (
            <SortableBookmarkCard
              key={bookmark.id}
              bookmark={bookmark}
              category={getCategoryById(bookmark.category)}
              onEdit={onEdit}
              onDelete={onDelete}
              onTogglePin={onTogglePin}
              index={index}
            />
          ))}
        </AnimatePresence>
      </div>
    </SortableContext>
  );
}
