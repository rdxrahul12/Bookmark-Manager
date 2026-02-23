import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Link, Tag } from "lucide-react";
import { Bookmark, Category } from "@/types/bookmark";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";

interface AddBookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (bookmark: Omit<Bookmark, "id" | "createdAt">) => void;
  categories: Category[];
  editingBookmark?: Bookmark | null;
}

export function AddBookmarkModal({
  isOpen,
  onClose,
  onSave,
  categories,
  editingBookmark,
}: AddBookmarkModalProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState(categories[0]?.id || "other");
  const [isPinned, setIsPinned] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const { toast } = useToast();
  const { animationMultiplier } = useUiPreferences();

  // Reset form when modal opens or editingBookmark changes
  useEffect(() => {
    if (isOpen) {
      setTitle(editingBookmark?.title || "");
      setUrl(editingBookmark?.url || "");
      setCategory(editingBookmark?.category || categories[0]?.id || "other");
      setIsPinned(editingBookmark?.isPinned || false);
    }
  }, [isOpen, editingBookmark, categories]);

  const handleSave = useCallback(() => {
    if (!title.trim() || !url.trim()) return;

    let finalUrl = url.trim();
    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      finalUrl = "https://" + finalUrl;
    }

    try {
      new URL(finalUrl);
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid website address.",
        variant: "destructive",
      });
      return;
    }

    onSave({
      title: title.trim(),
      url: finalUrl,
      category,
      isPinned,
    });

    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      onClose();
      setTitle("");
      setUrl("");
      setCategory(categories[0]?.id || "other");
      setIsPinned(false);
    }, 500);
  }, [title, url, category, isPinned, onSave, onClose, categories]);

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
            onClick={onClose}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl bg-background neu-raised p-6"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 300 / animationMultiplier, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-foreground">
                  {editingBookmark ? "Edit Bookmark" : "Add Bookmark"}
                </h2>
                <motion.button
                  onClick={onClose}
                  className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center"
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </motion.button>
              </div>

              {/* Form */}
              <div className="space-y-4">
                {/* Title input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Tag className="h-4 w-4 text-primary" />
                    Title
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="My Favorite Site"
                    className="neu-inset border-0 bg-background"
                  />
                </div>

                {/* URL input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Link className="h-4 w-4 text-primary" />
                    URL
                  </label>
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="neu-inset border-0 bg-background"
                  />
                </div>

                {/* Category selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => (
                      <motion.button
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${category === cat.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-foreground"
                          }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span>{cat.emoji}</span>
                        <span>{cat.name}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Pin toggle */}
                <motion.button
                  onClick={() => setIsPinned(!isPinned)}
                  className={`w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${isPinned
                    ? "bg-primary text-primary-foreground"
                    : "neu-raised-sm text-foreground"
                    }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  📌 {isPinned ? "Pinned to Quick Access" : "Pin to Quick Access"}
                </motion.button>
              </div>

              {/* Save button */}
              <motion.button
                onClick={handleSave}
                disabled={!title.trim() || !url.trim()}
                className="mt-6 w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
                    Saved!
                  </motion.span>
                ) : (
                  editingBookmark ? "Update Bookmark" : "Add Bookmark"
                )}
              </motion.button>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
