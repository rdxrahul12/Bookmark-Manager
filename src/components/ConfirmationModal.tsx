import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";

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
    const { animationMultiplier } = useUiPreferences();

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
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                                    <AlertTriangle className="h-6 w-6 text-destructive" />
                                </div>

                                <h3 className="text-xl font-bold text-foreground">{title}</h3>
                                <p className="text-sm text-muted-foreground">{description}</p>

                                <div className="flex gap-3 w-full pt-2">
                                    <motion.button
                                        onClick={onClose}
                                        className="flex-1 py-2 rounded-xl bg-background neu-raised-sm font-medium text-foreground"
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        {cancelText}
                                    </motion.button>
                                    <motion.button
                                        onClick={() => {
                                            onConfirm();
                                            onClose();
                                        }}
                                        className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground font-medium"
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        {confirmText}
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
