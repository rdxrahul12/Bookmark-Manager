import { memo } from "react";
import { motion } from "framer-motion";

import { Bookmark } from "@/types/bookmark";
import { Favicon } from "./Favicon";

interface MobileQuickAccessProps {
  bookmarks: Bookmark[];
}

/**
 * Quick-access strip shown below `lg` (≥1024px). At larger widths the header
 * already shows pinned bookmarks inline and we hide this strip via `lg:hidden`
 * to avoid duplication.
 */
function MobileQuickAccessImpl({ bookmarks }: MobileQuickAccessProps) {
  if (bookmarks.length === 0) return null;

  return (
    <motion.div
      className="lg:hidden p-4 rounded-2xl bg-background neu-raised"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.05 }}
    >
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Quick Access</h3>
      <div className="flex flex-wrap gap-3">
        {bookmarks.map((bookmark) => (
          <a
            key={bookmark.id}
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            title={bookmark.title}
            className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
          >
            <Favicon url={bookmark.url} title={bookmark.title} size={40} />
          </a>
        ))}
      </div>
    </motion.div>
  );
}

export const MobileQuickAccess = memo(MobileQuickAccessImpl);
MobileQuickAccess.displayName = "MobileQuickAccess";
