// Animation-speed preference. Replaces the old Context provider. Components
// subscribe via `useAnimationMultiplier()` and only re-render when the
// multiplier itself changes (not on every store change).

import { useEffect } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type AnimationSpeed = "fast" | "normal" | "relaxed";

interface UiPrefsState {
  animationSpeed: AnimationSpeed;
  setAnimationSpeed: (next: AnimationSpeed) => void;
}

const SPEED_TO_MULTIPLIER: Record<AnimationSpeed, number> = {
  fast: 0.5,
  normal: 1.0,
  relaxed: 2.0,
};

function applyMultiplier(speed: AnimationSpeed) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(
    "--duration-factor",
    SPEED_TO_MULTIPLIER[speed].toString(),
  );
}

export const useUiPrefsStore = create<UiPrefsState>()(
  persist(
    (set) => ({
      animationSpeed: "normal",
      setAnimationSpeed: (next) => {
        applyMultiplier(next);
        set({ animationSpeed: next });
      },
    }),
    {
      name: "bookmark-manager:ui-prefs",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state?.animationSpeed) applyMultiplier(state.animationSpeed);
      },
    },
  ),
);

export function useAnimationSpeed() {
  return useUiPrefsStore((s) => s.animationSpeed);
}

export function useAnimationMultiplier() {
  const speed = useUiPrefsStore((s) => s.animationSpeed);
  // Re-apply on mount; cheap idempotent op.
  useEffect(() => applyMultiplier(speed), [speed]);
  return SPEED_TO_MULTIPLIER[speed];
}

export function useSetAnimationSpeed() {
  return useUiPrefsStore((s) => s.setAnimationSpeed);
}
