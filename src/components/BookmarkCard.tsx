import { motion, AnimatePresence } from "framer-motion";
import { Edit2, Trash2, Pin } from "lucide-react";
import { Bookmark, Category } from "@/types/bookmark";
import { useState, useRef, useCallback, useEffect } from "react";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";
import { Favicon } from "./Favicon";

interface BookmarkCardProps {
  bookmark: Bookmark;
  category?: Category;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  index: number;
}

export function BookmarkCard({
  bookmark,
  category,
  onEdit,
  onDelete,
  onTogglePin,
  index,
}: BookmarkCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { animationSpeed, animationMultiplier } = useUiPreferences();

  const transition = { type: "spring", stiffness: 600 / animationMultiplier, damping: 30, delay: index * 0.015 * animationMultiplier } as const;

  // Delayed action reveal — only show after 0.3 seconds of continuous hover
  const handleHoverStart = useCallback(() => {
    setIsHovered(true);
    hoverTimerRef.current = setTimeout(() => {
      setShowActions(true);
    }, 300);
  }, []);

  const handleHoverEnd = useCallback(() => {
    setIsHovered(false);
    setShowActions(false);
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  return (
    <motion.div
      layout
      className={`relative group flex flex-col items-center shrink-0 ${showActions ? "z-50" : "z-0"}`}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.1 * animationMultiplier } }}
      transition={transition}
      onHoverStart={handleHoverStart}
      onHoverEnd={handleHoverEnd}
    >
      <motion.div
        className="relative flex flex-col items-center gap-1.5 cursor-pointer w-[58px] sm:w-[69px]"
        whileHover={{
          y: animationSpeed === "relaxed" ? -2 : -1,
          scale: 1.02,
          transition: { ...transition, delay: 0 },
        }}
        whileTap={{ scale: 0.95 }}
        transition={{ ...transition, delay: 0 }}
        onClick={() => window.open(bookmark.url, "_blank", "noopener,noreferrer")}
      >
        {/* Favicon */}
        <div className="relative shadow-sm rounded-[11px] hover:shadow-md transition-shadow">
          <Favicon
            url={bookmark.url}
            title={bookmark.title}
            size={54}
            className=""
          />

          {/* Pin badge — always visible when pinned */}
          {bookmark.isPinned && !showActions && (
            <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center shadow-sm">
              <Pin className="h-2 w-2 text-primary-foreground fill-current" />
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className="text-[10px] font-medium text-center text-foreground/80 line-clamp-1 w-full px-0.5 leading-tight select-none">
          {bookmark.title}
        </h3>
      </motion.div>

      {/* ============================================ */}
      {/* ACTION OVERLAY — appears after 1.2s hover */}
      {/* ============================================ */}
      <AnimatePresence>
        {showActions && (
          <motion.div
            className="absolute -top-3 left-1/2 flex items-center gap-1 z-30"
            style={{ transform: "translateX(-50%)" }}
            initial={{ opacity: 0, y: 8, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pin/Unpin */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(bookmark.id);
              }}
              className={`p-1.5 rounded-full backdrop-blur-md shadow-md border transition-colors ${
                bookmark.isPinned
                  ? "bg-primary text-primary-foreground border-primary/50 hover:bg-primary/80"
                  : "bg-background/95 text-muted-foreground border-border/60 hover:text-primary hover:bg-secondary"
              }`}
              title={bookmark.isPinned ? "Unpin" : "Pin"}
            >
              <Pin className={`h-3 w-3 ${bookmark.isPinned ? "fill-current" : ""}`} />
            </button>

            {/* Edit */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(bookmark);
              }}
              className="p-1.5 rounded-full bg-background/95 backdrop-blur-md shadow-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Edit"
            >
              <Edit2 className="h-3 w-3" />
            </button>

            {/* Delete */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(bookmark.id);
              }}
              className="p-1.5 rounded-full bg-background/95 backdrop-blur-md shadow-md border border-border/60 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
