import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Save } from "lucide-react";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";

interface ActionBarProps {
  onAddBookmark: () => void;
  onSaveSession?: () => void;
}

export function ActionBar({ onAddBookmark, onSaveSession }: ActionBarProps) {
  const { animationMultiplier } = useUiPreferences();

  return (
    <div className="flex items-center gap-3">
      {/* Add Bookmark button - Primary action with pulse */}
      <motion.button
        onClick={onAddBookmark}
        className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center animate-pulse-glow"
        title="Add Bookmark"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400 / animationMultiplier, damping: 17 }}
      >
        <motion.div
          whileHover={{ rotate: 90 }}
          transition={{ type: "spring", stiffness: 300 / animationMultiplier, damping: 15 }}
        >
          <Plus className="h-5 w-5" />
        </motion.div>
      </motion.button>

      {/* Save Session button */}
      {onSaveSession && (
        <motion.button
          onClick={onSaveSession}
          className="h-10 w-10 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center hover:bg-secondary/80"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title="Save all currently open tabs"
          transition={{ type: "spring", stiffness: 400 / animationMultiplier, damping: 17 }}
        >
          <motion.div
            whileHover={{ scale: 1.1 }}
            transition={{ type: "spring", stiffness: 300 / animationMultiplier, damping: 15 }}
          >
            <Save className="h-5 w-5" />
          </motion.div>
        </motion.button>
      )}
    </div>
  );
}
