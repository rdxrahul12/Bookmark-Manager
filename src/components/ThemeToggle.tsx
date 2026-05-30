import { memo } from "react";
import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";

import { useAnimationMultiplier } from "@/stores/uiPrefsStore";
import type { Theme } from "@/stores/themeStore";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

function ThemeToggleImpl({ theme, onToggle }: ThemeToggleProps) {
  const animationMultiplier = useAnimationMultiplier();

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="relative h-11 w-11 sm:h-12 sm:w-12 md:h-14 md:w-14 rounded-xl bg-background neu-raised flex items-center justify-center overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400 / animationMultiplier, damping: 17 }}
    >
      <motion.div
        initial={false}
        animate={{ rotate: theme === "dark" ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 200 / animationMultiplier, damping: 15 }}
      >
        {theme === "dark" ? (
          <Moon className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 text-primary rotate-180" />
        ) : (
          <Sun className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 text-primary" />
        )}
      </motion.div>
    </motion.button>
  );
}

export const ThemeToggle = memo(ThemeToggleImpl);
ThemeToggle.displayName = "ThemeToggle";
