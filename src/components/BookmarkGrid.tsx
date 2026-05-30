import { memo } from "react";
import { AnimatePresence } from "framer-motion";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";

import { Bookmark } from "@/types/bookmark";
import { SortableBookmarkCard } from "./SortableBookmarkCard";

interface BookmarkGridProps {
  bookmarks: Bookmark[];
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
}

function BookmarkGridImpl({ bookmarks, onEdit, onDelete, onTogglePin }: BookmarkGridProps) {
  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <div className="text-6xl mb-4" aria-hidden>
          📚
        </div>
        <p className="text-lg font-medium">No bookmarks yet</p>
        <p className="text-sm">Add your first bookmark to get started!</p>
      </div>
    );
  }

  const ids = bookmarks.map((b) => b.id);

  return (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      {/* Grid scales from 4 columns on a phone all the way to 18 on an
          ultra-wide display, so icons stay roughly the same physical size
          regardless of viewport width and the page never has dead side
          margins. */}
      <div className="grid grid-cols-4 xs:grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 2xl:grid-cols-14 3xl:grid-cols-16 4xl:grid-cols-18 gap-y-8 gap-x-4 md:gap-y-10 md:gap-x-6 justify-items-center py-6 px-4">
        <AnimatePresence mode="popLayout">
          {bookmarks.map((bookmark, index) => (
            <SortableBookmarkCard
              key={bookmark.id}
              bookmark={bookmark}
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

export const BookmarkGrid = memo(BookmarkGridImpl);
BookmarkGrid.displayName = "BookmarkGrid";
