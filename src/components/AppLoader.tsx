import { motion } from "framer-motion";
import { useAnimationMultiplier } from "@/stores/uiPrefsStore";

export function AppLoader() {
  const animationMultiplier = useAnimationMultiplier();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center" role="status" aria-label="Loading">
      <motion.div
        className="h-16 w-16 rounded-full bg-primary"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ repeat: Infinity, duration: 1 * animationMultiplier }}
      />
    </div>
  );
}
