// Accessible modal primitive — built on Radix Dialog (already a dependency)
// with our neumorphic styling and motion. Replaces three hand-rolled modals
// that lacked focus management, Esc handling, and aria attributes.

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAnimationMultiplier } from "@/stores/uiPrefsStore";

interface ModalProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  className?: string;
  contentClassName?: string;
  showClose?: boolean;
  children: React.ReactNode;
  /** Optional id used to label the dialog for screen readers. */
  ariaLabelledBy?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  className,
  contentClassName,
  showClose = true,
  children,
  ariaLabelledBy,
  ...rootProps
}: ModalProps) {
  const animationMultiplier = useAnimationMultiplier();
  const generatedTitleId = React.useId();
  const titleId = ariaLabelledBy ?? generatedTitleId;

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()} {...rootProps}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          aria-labelledby={titleId}
          className={cn(
            // Mobile: anchor to viewport with safe-area insets so the modal
            // never gets clipped on phones with rotated keyboards. Desktop:
            // centered overlay with comfortable max-width.
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh-2rem)] overflow-y-auto p-4",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            className,
          )}
        >
          <motion.div
            className={cn(
              "rounded-2xl bg-background neu-raised p-6 shadow-xl outline-none",
              contentClassName,
            )}
            initial={{ scale: 0.92, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 16, opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 300 / animationMultiplier,
              damping: 25,
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="space-y-1">
                <DialogPrimitive.Title
                  id={titleId}
                  className="text-xl font-bold text-foreground"
                >
                  {title}
                </DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="text-sm text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              {showClose && (
                <DialogPrimitive.Close
                  asChild
                  aria-label="Close"
                >
                  <motion.button
                    type="button"
                    className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    whileHover={{ scale: 1.05, rotate: 90 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <X className="h-4 w-4" />
                  </motion.button>
                </DialogPrimitive.Close>
              )}
            </div>

            {children}
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
