import { memo } from "react";
import { motion } from "framer-motion";
import { Plus, Save } from "lucide-react";

import { useAnimationMultiplier } from "@/stores/uiPrefsStore";

interface ActionBarProps {
  onAddBookmark: () => void;
  onSaveSession: (() => void) | null;
}

function ActionBarImpl({ onAddBookmark, onSaveSession }: ActionBarProps) {
  const animationMultiplier = useAnimationMultiplier();

  return (
    <div className="flex items-center gap-3">
      <motion.button
        type="button"
        onClick={onAddBookmark}
        aria-label="Add bookmark"
        title="Add Bookmark"
        className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center animate-pulse-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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

      {onSaveSession && (
        <motion.button
          type="button"
          onClick={onSaveSession}
          aria-label="Save current session"
          title="Save all currently open tabs"
          className="h-10 w-10 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
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

export const ActionBar = memo(ActionBarImpl);
ActionBar.displayName = "ActionBar";
