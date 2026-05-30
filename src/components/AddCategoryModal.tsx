import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

interface AddCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (category: { name: string; emoji: string }) => void;
}

const NAME_MAX_LEN = 40;

const EMOJI_OPTIONS = [
  "📁",
  "🌐",
  "💬",
  "🧑‍💻",
  "👩‍💻",
  "🛍️",
  "🛠️",
  "📌",
  "📚",
  "🎮",
  "🎵",
  "🎬",
  "📰",
  "💼",
  "📊",
  "🧠",
  "🏠",
  "✈️",
  "🍳",
  "💰",
];

interface ValidationErrors {
  name?: string;
}

function validate(name: string): ValidationErrors {
  const errors: ValidationErrors = {};
  const trimmed = name.trim();
  if (!trimmed) errors.name = "Name is required";
  else if (trimmed.length > NAME_MAX_LEN) {
    errors.name = `Keep it under ${NAME_MAX_LEN} characters`;
  }
  return errors;
}

export function AddCategoryModal({ isOpen, onClose, onSave }: AddCategoryModalProps) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const [showSuccess, setShowSuccess] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setEmoji("📁");
    setShowSuccess(false);
    setTouched(false);
    setSubmitAttempted(false);
  }, [isOpen]);

  const errors = useMemo(() => validate(name), [name]);
  const isValid = Object.keys(errors).length === 0;
  const showNameError = (touched || submitAttempted) && !!errors.name;

  const handleSave = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      setSubmitAttempted(true);
      if (!isValid) return;

      onSave({ name: name.trim(), emoji });
      setShowSuccess(true);
      const timer = setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 500);
      return () => clearTimeout(timer);
    },
    [isValid, name, emoji, onSave, onClose],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Category"
      contentClassName="max-w-sm"
    >
      <form onSubmit={handleSave} noValidate>
        <div className="mb-4">
          <span className="text-sm font-medium text-foreground mb-2 block">
            Choose an emoji
          </span>
          <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label="Emoji">
            {EMOJI_OPTIONS.map((option) => (
              <motion.button
                key={option}
                type="button"
                role="radio"
                aria-checked={emoji === option}
                aria-label={`Choose ${option}`}
                onClick={() => setEmoji(option)}
                className={cn(
                  "h-8 w-8 rounded-lg text-lg flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  emoji === option
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary hover:bg-accent",
                )}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                {option}
              </motion.button>
            ))}
          </div>
        </div>

        <div className="mb-6 space-y-2">
          <label
            htmlFor="category-name"
            className="text-sm font-medium text-foreground block"
          >
            Category name
          </label>
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>
              {emoji}
            </span>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="Enter category name"
              autoFocus
              maxLength={NAME_MAX_LEN}
              autoComplete="off"
              aria-invalid={showNameError || undefined}
              aria-describedby={showNameError ? "category-name-error" : undefined}
              className={cn(
                "neu-inset border-0 bg-background",
                showNameError && "ring-2 ring-destructive",
              )}
            />
          </div>
          {showNameError && (
            <p id="category-name-error" role="alert" className="text-xs text-destructive">
              {errors.name}
            </p>
          )}
        </div>

        <motion.button
          type="submit"
          disabled={!isValid && submitAttempted}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          whileHover={isValid ? { scale: 1.02 } : undefined}
          whileTap={isValid ? { scale: 0.98 } : undefined}
          animate={showSuccess ? { scale: [1, 1.06, 1] } : undefined}
        >
          {showSuccess ? (
            <span className="flex items-center justify-center gap-2">
              <Check className="h-5 w-5" />
              Added!
            </span>
          ) : (
            "Add Category"
          )}
        </motion.button>
      </form>
    </Modal>
  );
}
