import { memo } from "react";
import { motion } from "framer-motion";

import { Bookmark } from "@/types/bookmark";
import { Favicon } from "./Favicon";
import { useAnimationMultiplier } from "@/stores/uiPrefsStore";

interface QuickAccessProps {
  bookmarks: Bookmark[];
}

function QuickAccessImpl({ bookmarks }: QuickAccessProps) {
  const animationMultiplier = useAnimationMultiplier();

  if (bookmarks.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground mr-2">Quick:</span>
      <div className="flex items-center gap-2">
        {bookmarks.slice(0, 6).map((bookmark, index) => (
          <motion.a
            key={bookmark.id}
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xl"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 300 / animationMultiplier,
              damping: 20,
              delay: index * 0.05 * animationMultiplier,
            }}
            whileHover={{
              scale: 1.05,
              y: -2,
              transition: { type: "spring", stiffness: 400 / animationMultiplier, damping: 10 },
            }}
            whileTap={{ scale: 0.92 }}
            title={bookmark.title}
          >
            <Favicon url={bookmark.url} title={bookmark.title} size={43} />
          </motion.a>
        ))}
      </div>
    </div>
  );
}

export const QuickAccess = memo(QuickAccessImpl);
QuickAccess.displayName = "QuickAccess";
