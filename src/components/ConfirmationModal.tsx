import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

import { Modal } from "./ui/modal";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Delete",
  cancelText = "Cancel",
}: ConfirmationModalProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      contentClassName="max-w-sm"
      showClose={false}
    >
      <div className="flex flex-col items-center text-center space-y-4">
        <div
          className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center"
          aria-hidden
        >
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>

        <div className="flex gap-3 w-full pt-2">
          <motion.button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-background neu-raised-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {cancelText}
          </motion.button>
          <motion.button
            type="button"
            onClick={handleConfirm}
            className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {confirmText}
          </motion.button>
        </div>
      </div>
    </Modal>
  );
}
