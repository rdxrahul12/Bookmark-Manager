// Light/dark theme: persisted, with system-preference fallback.
//
// Side effect of toggling — adds/removes the `dark` class on documentElement.
// We expose a single `useTheme` hook that does the right thing on mount and
// on toggle, regardless of how the store was rehydrated.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect } from "react";

export type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
}

function applyThemeClass(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function detectInitial(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: detectInitial(),
      setTheme: (next) => {
        applyThemeClass(next);
        set({ theme: next });
      },
      toggleTheme: () => {
        const next: Theme = get().theme === "dark" ? "light" : "dark";
        applyThemeClass(next);
        set({ theme: next });
      },
    }),
    {
      name: "bookmark-manager:theme",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ theme: s.theme }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyThemeClass(state.theme);
      },
    },
  ),
);

/**
 * Stable hook with the theme value plus stable action references.
 * Also reapplies the theme class on first mount to recover from any
 * race between SSR-style initial render and hydration.
 */
export function useTheme() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  return { theme, setTheme, toggleTheme };
}
