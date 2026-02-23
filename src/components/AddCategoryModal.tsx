import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";

interface AddCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (category: { name: string; emoji: string }) => void;
}

const EMOJI_OPTIONS = [
];

export function AddCategoryModal({ isOpen, onClose, onSave }: AddCategoryModalProps) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const [showSuccess, setShowSuccess] = useState(false);
  const { animationMultiplier } = useUiPreferences();

  const handleSave = useCallback(() => {
    if (!name.trim()) return;

    onSave({ name: name.trim(), emoji });

    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      onClose();
      setName("");
      setEmoji("📁");
    }, 500);
  }, [name, emoji, onSave, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-sm rounded-2xl bg-background neu-raised p-6"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 300 / animationMultiplier, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-foreground">Add Category</h2>
                <motion.button
                  onClick={onClose}
                  className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center"
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </motion.button>
              </div>

              {/* Emoji picker */}
              <div className="mb-4">
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Choose an emoji
                </label>
                <div className="grid grid-cols-10 gap-1">
                  {EMOJI_OPTIONS.map((e, index) => (
                    <motion.button
                      key={e}
                      onClick={() => setEmoji(e)}
                      className={`h-8 w-8 rounded-lg text-lg flex items-center justify-center ${emoji === e
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary hover:bg-accent"
                        }`}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.01 * animationMultiplier }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      {e}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Name input */}
              <div className="mb-6">
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Category name
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{emoji}</span>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter category name"
                    className="neu-inset border-0 bg-background"
                  />
                </div>
              </div>

              {/* Save button */}
              <motion.button
                onClick={handleSave}
                disabled={!name.trim()}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                animate={showSuccess ? { scale: [1, 1.1, 1] } : {}}
              >
                {showSuccess ? (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex items-center justify-center gap-2"
                  >
                    <Check className="h-5 w-5" />
                    Added!
                  </motion.span>
                ) : (
                  "Add Category"
                )}
              </motion.button>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
