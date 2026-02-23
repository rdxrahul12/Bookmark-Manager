import { motion } from "framer-motion";
import { Bookmark as BookmarkIcon } from "lucide-react";
import { Clock } from "./Clock";
import { ThemeToggle } from "./ThemeToggle";
import { QuickAccess } from "./QuickAccess";
import { SettingsMenu } from "./SettingsMenu";
import { Bookmark, Category } from "@/types/bookmark";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";

interface HeaderProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  pinnedBookmarks: Bookmark[];
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  categories: Category[];
  onUpdateCategory: (id: string, updates: Partial<Category>) => void;
}

export function Header({ theme, onToggleTheme, pinnedBookmarks, onExport, onImport, categories, onUpdateCategory }: HeaderProps) {
  const { animationMultiplier } = useUiPreferences();

  return (
    <motion.header
      className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-3 md:p-5 rounded-2xl bg-background neu-raised"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300 / animationMultiplier, damping: 25 }}
    >
      {/* Left section: Logo + Title */}
      <div className="flex items-center gap-4">
        <motion.div
          className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center"
          whileHover={{ rotate: 10, scale: 1.05 }}
          transition={{ type: "spring", stiffness: 400 / animationMultiplier, damping: 17 }}
        >
          <BookmarkIcon className="h-6 w-6 text-primary-foreground" />
        </motion.div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold gradient-text">
            Bookmark Manager
          </h1>
          <p className="text-xs text-muted-foreground hidden sm:block">
            by R D x
          </p>
        </div>
      </div>

      {/* Center section: Quick Access (hidden on mobile) */}
      <div className="hidden lg:flex">
        <QuickAccess bookmarks={pinnedBookmarks} />
      </div>

      {/* Right section: Clock + Theme Toggle + Settings */}
      <div className="flex items-center gap-4">
        <div className="hidden sm:block">
          <Clock />
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <SettingsMenu
          onExport={onExport}
          onImport={onImport}
          theme={theme}
          onToggleTheme={onToggleTheme}
          categories={categories}
          onUpdateCategory={onUpdateCategory}
        />
      </div>
    </motion.header>
  );
}

