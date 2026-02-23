import { motion } from "framer-motion";
import { Edit2, Trash2, Pin, PinOff, ExternalLink } from "lucide-react";
import { Bookmark, Category } from "@/types/bookmark";
import { useState } from "react";
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
  const [isPressed, setIsPressed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { animationSpeed, animationMultiplier } = useUiPreferences();

  const transition = { type: "spring", stiffness: 600 / animationMultiplier, damping: 30, delay: index * 0.015 * animationMultiplier } as const;

  return (
    <motion.div
      layout
      className={`relative group w-[90%] mx-auto ${isHovered ? "z-50" : "z-0"}`}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.1 * animationMultiplier } }}
      transition={transition}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <motion.div
        className={`relative flex flex-col items-center p-4 rounded-2xl bg-card cursor-pointer overflow-hidden ${isPressed ? "neu-pressed" : "neu-raised"
          }`}
        animate={{
          boxShadow: isHovered
            ? "0 0 25px hsl(var(--primary) / 0.4), 0 0 50px hsl(var(--primary) / 0.2)"
            : "none",
        }}
        whileHover={{
          y: animationSpeed === "relaxed" ? -12 : -8,
          scale: 1.02,
          rotate: Math.random() > 0.5 ? 1 : -1,
          transition: { ...transition, delay: 0 },
        }}
        whileTap={{ scale: 0.98 }}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
        transition={{ ...transition, delay: 0 }}
        onClick={() => window.open(bookmark.url, "_blank", "noopener,noreferrer")}
      >
        {/* Favicon */}
        <div className="relative mb-3">
          <Favicon
            url={bookmark.url}
            title={bookmark.title}
            size={40}
            className="rounded-[10px]"
          />
        </div>

        {/* Title */}
        <h3 className="text-sm font-medium text-center text-foreground line-clamp-2 mb-1">
          {bookmark.title}
        </h3>
      </motion.div>

      {/* Action buttons - Bottom Right Minimal Pill */}
      {/* Top Left: Pin Action */}
      <motion.button
        className={`absolute top-3 left-3 p-1.5 rounded-lg backdrop-blur-sm shadow-sm border border-border/50 z-20 transition-colors ${bookmark.isPinned
          ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
          : "bg-background/90 text-muted-foreground hover:text-primary hover:bg-secondary"
          }`}
        initial={{ opacity: 0, scale: 0.9, x: -10 }}
        animate={{
          opacity: isHovered || bookmark.isPinned ? 1 : 0,
          scale: isHovered || bookmark.isPinned ? 1 : 0.9,
          x: isHovered || bookmark.isPinned ? 0 : -10,
        }}
        transition={{ duration: 0.2 * animationMultiplier }}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(bookmark.id);
        }}
        title={bookmark.isPinned ? "Unpin" : "Pin"}
      >
        <Pin className={`h-3.5 w-3.5 ${bookmark.isPinned ? "fill-current" : ""}`} />
      </motion.button>

      {/* Top Right: Edit & Delete Actions */}
      <motion.div
        className="absolute top-3 right-3 flex flex-col gap-1 z-20"
        initial={{ opacity: 0, scale: 0.9, x: 10 }}
        animate={{
          opacity: isHovered ? 1 : 0,
          scale: isHovered ? 1 : 0.9,
          x: isHovered ? 0 : 10,
        }}
        transition={{ duration: 0.2 * animationMultiplier }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(bookmark);
          }}
          className="p-1.5 rounded-lg bg-background/90 backdrop-blur-sm shadow-sm border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Edit"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(bookmark.id);
          }}
          className="p-1.5 rounded-lg bg-background/90 backdrop-blur-sm shadow-sm border border-border/50 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </motion.div>
    </motion.div>
  );
}
