import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Link as LinkIcon, Tag } from "lucide-react";

import { Bookmark, Category } from "@/types/bookmark";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { normalizeUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

interface AddBookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (bookmark: Omit<Bookmark, "id" | "createdAt">) => void;
  categories: Category[];
  editingBookmark: Bookmark | null;
}

interface ValidationErrors {
  title?: string;
  url?: string;
  category?: string;
}

const TITLE_MAX_LEN = 80;

function validate(
  title: string,
  url: string,
  category: string,
  categories: Category[],
): { errors: ValidationErrors; normalizedUrl: string | null } {
  const errors: ValidationErrors = {};
  const trimmedTitle = title.trim();
  if (!trimmedTitle) errors.title = "Title is required";
  else if (trimmedTitle.length > TITLE_MAX_LEN) {
    errors.title = `Keep it under ${TITLE_MAX_LEN} characters`;
  }

  const trimmedUrl = url.trim();
  let normalized: string | null = null;
  if (!trimmedUrl) {
    errors.url = "URL is required";
  } else {
    normalized = normalizeUrl(trimmedUrl);
    if (!normalized) errors.url = "Enter a valid website (e.g. example.com)";
  }

  if (!category || !categories.some((c) => c.id === category)) {
    errors.category = "Pick a category";
  }

  return { errors, normalizedUrl: normalized };
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
  const [category, setCategory] = useState<string>(
    () => editingBookmark?.category ?? categories[0]?.id ?? "",
  );
  const [isPinned, setIsPinned] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [touched, setTouched] = useState({ title: false, url: false });
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Re-seed form whenever the modal opens or editing target changes.
  useEffect(() => {
    if (!isOpen) return;
    setTitle(editingBookmark?.title ?? "");
    setUrl(editingBookmark?.url ?? "");
    setCategory(editingBookmark?.category ?? categories[0]?.id ?? "");
    setIsPinned(editingBookmark?.isPinned ?? false);
    setShowSuccess(false);
    setTouched({ title: false, url: false });
    setSubmitAttempted(false);
  }, [isOpen, editingBookmark, categories]);

  // Validation runs every render — cheap, and keeps the submit button + the
  // inline error messages in sync without separate effects.
  const { errors, normalizedUrl } = useMemo(
    () => validate(title, url, category, categories),
    [title, url, category, categories],
  );
  const isValid = Object.keys(errors).length === 0;

  // Show errors only after the field has been touched OR a submit was tried.
  const showTitleError = (touched.title || submitAttempted) && !!errors.title;
  const showUrlError = (touched.url || submitAttempted) && !!errors.url;
  const showCategoryError = submitAttempted && !!errors.category;

  const handleSave = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      setSubmitAttempted(true);
      if (!isValid || !normalizedUrl) return;

      onSave({
        title: title.trim(),
        url: normalizedUrl,
        category,
        isPinned,
      });

      setShowSuccess(true);
      const timer = setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 500);
      return () => clearTimeout(timer);
    },
    [isValid, normalizedUrl, title, category, isPinned, onSave, onClose],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingBookmark ? "Edit Bookmark" : "Add Bookmark"}
    >
      <form onSubmit={handleSave} noValidate>
        <div className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="bookmark-title"
              className="text-sm font-medium text-foreground flex items-center gap-2"
            >
              <Tag className="h-4 w-4 text-primary" aria-hidden />
              Title
            </label>
            <Input
              id="bookmark-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, title: true }))}
              placeholder="My Favorite Site"
              autoFocus
              maxLength={TITLE_MAX_LEN}
              autoComplete="off"
              aria-invalid={showTitleError || undefined}
              aria-describedby={showTitleError ? "bookmark-title-error" : undefined}
              className={cn(
                "neu-inset border-0 bg-background",
                showTitleError && "ring-2 ring-destructive",
              )}
            />
            {showTitleError && (
              <p id="bookmark-title-error" role="alert" className="text-xs text-destructive">
                {errors.title}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="bookmark-url"
              className="text-sm font-medium text-foreground flex items-center gap-2"
            >
              <LinkIcon className="h-4 w-4 text-primary" aria-hidden />
              URL
            </label>
            <Input
              id="bookmark-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, url: true }))}
              placeholder="https://example.com"
              autoComplete="url"
              inputMode="url"
              aria-invalid={showUrlError || undefined}
              aria-describedby={showUrlError ? "bookmark-url-error" : undefined}
              className={cn(
                "neu-inset border-0 bg-background",
                showUrlError && "ring-2 ring-destructive",
              )}
            />
            {showUrlError && (
              <p id="bookmark-url-error" role="alert" className="text-xs text-destructive">
                {errors.url}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">Category</span>
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-label="Category"
              aria-invalid={showCategoryError || undefined}
            >
              {categories.map((cat) => (
                <motion.button
                  key={cat.id}
                  type="button"
                  role="radio"
                  aria-checked={category === cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    category === cat.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground",
                  )}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {cat.emoji && <span aria-hidden>{cat.emoji}</span>}
                  <span>{cat.name}</span>
                </motion.button>
              ))}
            </div>
            {showCategoryError && (
              <p role="alert" className="text-xs text-destructive">
                {errors.category}
              </p>
            )}
          </div>

          <motion.button
            type="button"
            onClick={() => setIsPinned((v) => !v)}
            aria-pressed={isPinned}
            className={cn(
              "w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              isPinned ? "bg-primary text-primary-foreground" : "neu-raised-sm text-foreground",
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            📌 {isPinned ? "Pinned to Quick Access" : "Pin to Quick Access"}
          </motion.button>
        </div>

        <motion.button
          type="submit"
          disabled={!isValid && submitAttempted}
          className="mt-6 w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          whileHover={isValid ? { scale: 1.02 } : undefined}
          whileTap={isValid ? { scale: 0.98 } : undefined}
          animate={showSuccess ? { scale: [1, 1.06, 1] } : undefined}
        >
          {showSuccess ? (
            <span className="flex items-center justify-center gap-2">
              <Check className="h-5 w-5" />
              Saved!
            </span>
          ) : editingBookmark ? (
            "Update Bookmark"
          ) : (
            "Add Bookmark"
          )}
        </motion.button>
      </form>
    </Modal>
  );
}
