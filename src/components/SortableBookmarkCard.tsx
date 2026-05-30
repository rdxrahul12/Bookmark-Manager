import { forwardRef, memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { BookmarkCard } from "./BookmarkCard";
import { Bookmark } from "@/types/bookmark";

interface SortableBookmarkCardProps {
  bookmark: Bookmark;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  index: number;
}

// Wrapped in `forwardRef` because Framer Motion's `<AnimatePresence
// mode="popLayout">` (used by the parent grid) measures each direct
// child via ref. Plain function components reject refs and React logs a
// "Function components cannot be given refs" warning. Forwarding the ref
// to the wrapper div satisfies the measurement and removes the warning.
const SortableBookmarkCardInner = forwardRef<HTMLDivElement, SortableBookmarkCardProps>(
  function SortableBookmarkCardInner(props, _forwardedRef) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
      useSortable({ id: props.bookmark.id });

    // The wrapper deliberately leaves zIndex unset when idle so the CSS
    // `:hover` and `:focus-within` rules below can elevate the whole stacking
    // context above neighboring cards. Without this, a card's overflow
    // content (action overlay, tooltip arrow) gets painted *behind* the next
    // card in DOM order, which is exactly the "delete icon hidden behind
    // next bookmark" bug we previously hit.
    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.8 : 1,
      position: "relative",
      ...(isDragging ? { zIndex: 60 } : {}),
    };

    // dnd-kit owns the live ref via `setNodeRef`. We chain framer-motion's
    // forwarded ref onto the same DOM node so layout measurement works
    // alongside drag handling.
    const setRefs = (node: HTMLDivElement | null) => {
      setNodeRef(node);
      if (typeof _forwardedRef === "function") _forwardedRef(node);
      else if (_forwardedRef) _forwardedRef.current = node;
    };

    return (
      <div
        ref={setRefs}
        style={style}
        {...attributes}
        {...listeners}
        className="hover:z-40 focus-within:z-40"
      >
        <BookmarkCard {...props} />
      </div>
    );
  },
);

export const SortableBookmarkCard = memo(SortableBookmarkCardInner);
SortableBookmarkCard.displayName = "SortableBookmarkCard";
