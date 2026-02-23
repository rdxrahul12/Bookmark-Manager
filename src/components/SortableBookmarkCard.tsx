import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BookmarkCard } from "./BookmarkCard";
import { Bookmark, Category } from "@/types/bookmark";

interface SortableBookmarkCardProps {
    bookmark: Bookmark;
    category?: Category;
    onEdit: (bookmark: Bookmark) => void;
    onDelete: (id: string) => void;
    onTogglePin: (id: string) => void;
    index: number;
}

export function SortableBookmarkCard(props: SortableBookmarkCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: props.bookmark.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 0,
        opacity: isDragging ? 0.8 : 1,
        position: "relative" as const,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <BookmarkCard {...props} />
        </div>
    );
}
