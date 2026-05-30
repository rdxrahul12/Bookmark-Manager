import { memo } from "react";
import { motion } from "framer-motion";
import { Bookmark as BookmarkIcon, Search } from "lucide-react";

import { Bookmark } from "@/types/bookmark";
import { Clock } from "./Clock";
import { ThemeToggle } from "./ThemeToggle";
import { QuickAccess } from "./QuickAccess";
import { SettingsMenu } from "./SettingsMenu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAnimationMultiplier } from "@/stores/uiPrefsStore";
import type { Theme } from "@/stores/themeStore";

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
  pinnedBookmarks: Bookmark[];
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  onOpenSearch: () => void;
}

function HeaderImpl({
  theme,
  onToggleTheme,
  pinnedBookmarks,
  onExport,
  onImport,
  onOpenSearch,
}: HeaderProps) {
  const animationMultiplier = useAnimationMultiplier();

  return (
    <motion.header
      className="flex flex-wrap items-center justify-between gap-3 md:gap-4 p-3 md:p-5 rounded-2xl bg-background neu-raised"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300 / animationMultiplier, damping: 25 }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <motion.div
          className="h-12 w-12 shrink-0 rounded-xl bg-primary flex items-center justify-center"
          whileHover={{ rotate: 10, scale: 1.05 }}
          transition={{ type: "spring", stiffness: 400 / animationMultiplier, damping: 17 }}
        >
          <BookmarkIcon className="h-6 w-6 text-primary-foreground" aria-hidden />
        </motion.div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold gradient-text truncate">
            Bookmark Manager
          </h1>
          <p className="text-xs text-muted-foreground hidden sm:block">by R D x</p>
        </div>

        {/* Search trigger — small icon button right after the title.
            Tap pops the Spotlight-style overlay. No keyboard hint shown. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.button
              type="button"
              onClick={onOpenSearch}
              aria-label="Search bookmarks"
              className="ml-1 sm:ml-3 inline-flex items-center justify-center h-10 w-10 rounded-xl bg-card neu-raised-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400 / animationMultiplier, damping: 17 }}
            >
              <Search className="h-4 w-4" aria-hidden />
            </motion.button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Search bookmarks
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="hidden lg:flex order-3 lg:order-2 w-full lg:w-auto justify-center">
        <QuickAccess bookmarks={pinnedBookmarks} />
      </div>

      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 shrink-0 order-2 lg:order-3">
        <div className="hidden sm:block">
          <Clock />
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <SettingsMenu
          onExport={onExport}
          onImport={onImport}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />
      </div>
    </motion.header>
  );
}

export const Header = memo(HeaderImpl);
Header.displayName = "Header";
