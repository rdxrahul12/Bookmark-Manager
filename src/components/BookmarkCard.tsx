import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Edit2, Pin, Trash2 } from "lucide-react";

import { Bookmark } from "@/types/bookmark";
import { Favicon } from "./Favicon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useAnimationMultiplier,
  useAnimationSpeed,
} from "@/stores/uiPrefsStore";
import { useIsTruncated } from "@/hooks/useIsTruncated";

interface BookmarkCardProps {
  bookmark: Bookmark;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  index: number;
}

const HOVER_REVEAL_MS = 300;

function BookmarkCardImpl({
  bookmark,
  onEdit,
  onDelete,
  onTogglePin,
  index,
}: BookmarkCardProps) {
  const [showActions, setShowActions] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animationSpeed = useAnimationSpeed();
  const animationMultiplier = useAnimationMultiplier();

  // Detect whether the title is actually being clipped. We always mount the
  // Tooltip wrapper so that `card` keeps the same parent across renders (no
  // hover-state churn when truncation toggles); the popup itself only renders
  // when `isTruncated` is true.
  const { ref: titleRef, isTruncated } = useIsTruncated<HTMLHeadingElement>(
    bookmark.title,
  );

  const transition = {
    type: "spring" as const,
    stiffness: 600 / animationMultiplier,
    damping: 30,
    delay: index * 0.015 * animationMultiplier,
  };

  const handleHoverStart = useCallback(() => {
    hoverTimerRef.current = setTimeout(
      () => setShowActions(true),
      HOVER_REVEAL_MS,
    );
  }, []);

  const handleHoverEnd = useCallback(() => {
    setShowActions(false);
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleOpen = useCallback(() => {
    window.open(bookmark.url, "_blank", "noopener,noreferrer");
  }, [bookmark.url]);

  const handleKeyOpen = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleOpen();
      }
    },
    [handleOpen],
  );

  const handlePin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onTogglePin(bookmark.id);
    },
    [bookmark.id, onTogglePin],
  );

  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit(bookmark);
    },
    [bookmark, onEdit],
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(bookmark.id);
    },
    [bookmark.id, onDelete],
  );

  // The actual visible card (favicon + title). Wrapped in Tooltip so that
  // hovering anywhere on this card surface — not just the tiny title text —
  // surfaces the full bookmark name when it's been clipped.
  const cardSurface = (
    <motion.div
      role="link"
      tabIndex={0}
      aria-label={`Open ${bookmark.title}`}
      className="relative flex flex-col items-center gap-1.5 cursor-pointer w-[58px] sm:w-[69px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xl"
      whileHover={{
        y: animationSpeed === "relaxed" ? -2 : -1,
        scale: 1.02,
        transition: { ...transition, delay: 0 },
      }}
      whileTap={{ scale: 0.95 }}
      transition={{ ...transition, delay: 0 }}
      onClick={handleOpen}
      onKeyDown={handleKeyOpen}
    >
      <div className="relative shadow-sm rounded-[11px] hover:shadow-md transition-shadow">
        <Favicon url={bookmark.url} title={bookmark.title} size={54} />
        {bookmark.isPinned && !showActions && (
          <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center shadow-sm">
            <Pin className="h-2 w-2 text-primary-foreground fill-current" />
          </div>
        )}
      </div>

      <h3
        ref={titleRef}
        className="text-[10px] font-medium text-center text-foreground/80 line-clamp-1 w-full px-0.5 leading-tight select-none"
      >
        {bookmark.title}
      </h3>
    </motion.div>
  );

  return (
    <motion.div
      layout
      className="relative group flex flex-col items-center shrink-0"
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        scale: 0.9,
        transition: { duration: 0.1 * animationMultiplier },
      }}
      transition={transition}
      onHoverStart={handleHoverStart}
      onHoverEnd={handleHoverEnd}
    >
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>{cardSurface}</TooltipTrigger>
        {isTruncated && (
          <TooltipContent
            side="bottom"
            sideOffset={6}
            collisionPadding={12}
            className="max-w-[240px] break-words text-xs leading-snug"
          >
            {bookmark.title}
          </TooltipContent>
        )}
      </Tooltip>

      <AnimatePresence>
        {showActions && (
          <motion.div
            className="absolute -top-3 left-1/2 flex items-center gap-1 z-30"
            style={{ transform: "translateX(-50%)" }}
            initial={{ opacity: 0, y: 8, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handlePin}
              aria-pressed={bookmark.isPinned}
              aria-label={bookmark.isPinned ? "Unpin bookmark" : "Pin bookmark"}
              className={`p-1.5 rounded-full backdrop-blur-md shadow-md border transition-colors ${
                bookmark.isPinned
                  ? "bg-primary text-primary-foreground border-primary/50 hover:bg-primary/80"
                  : "bg-background/95 text-muted-foreground border-border/60 hover:text-primary hover:bg-secondary"
              }`}
            >
              <Pin className={`h-3 w-3 ${bookmark.isPinned ? "fill-current" : ""}`} />
            </button>

            <button
              type="button"
              onClick={handleEditClick}
              aria-label={`Edit ${bookmark.title}`}
              className="p-1.5 rounded-full bg-background/95 backdrop-blur-md shadow-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Edit2 className="h-3 w-3" />
            </button>

            <button
              type="button"
              onClick={handleDeleteClick}
              aria-label={`Delete ${bookmark.title}`}
              className="p-1.5 rounded-full bg-background/95 backdrop-blur-md shadow-md border border-border/60 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export const BookmarkCard = memo(BookmarkCardImpl);
BookmarkCard.displayName = "BookmarkCard";
