/**
 * Accent color preference.
 *
 * Persists the user's chosen accent (e.g. Netflix Red, Amazon Orange) and
 * applies it as live CSS custom properties so the entire app picks up the
 * change without a re-render. We override `--primary` (used by buttons,
 * focus rings, glows, the gradient title) and `--ring` (focus indicator)
 * plus the matching `--sidebar-*` vars for completeness.
 *
 * Why CSS vars and not Tailwind theme switching:
 *   • The whole design system already references `hsl(var(--primary))`
 *     in dozens of utility classes (`bg-primary`, `text-primary`,
 *     `glow-primary`, neumorphic shadows). Flipping vars at the root
 *     re-tints everything atomically.
 *   • No FOUC: `onRehydrateStorage` reapplies on the very first paint.
 */

import { useEffect } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type AccentId = "red" | "orange";

interface AccentDefinition {
  id: AccentId;
  /** Human-readable label shown in the picker. */
  label: string;
  /** HSL triple in the same shape as `--primary` already uses. */
  hsl: string;
  /** Hex preview — only used for the swatch dot in the UI. */
  hex: string;
}

/**
 * Catalog. Add new entries here and the picker auto-renders them.
 *
 * Color sourcing:
 *   • Red — Netflix red `#E50914` ≈ HSL(357, 92%, 47%). Original brand
 *     of the app, kept as the default so existing users see no change.
 *   • Orange — Amazon orange `#FF9900` ≈ HSL(36, 100%, 50%). Vivid and
 *     readable on both light and pitch-black themes.
 */
export const ACCENTS: Record<AccentId, AccentDefinition> = {
  red: {
    id: "red",
    label: "Netflix Red",
    hsl: "357 92% 47%",
    hex: "#E50914",
  },
  orange: {
    id: "orange",
    label: "Amazon Orange",
    hsl: "36 100% 50%",
    hex: "#FF9900",
  },
};

interface AccentState {
  accent: AccentId;
  setAccent: (next: AccentId) => void;
}

/**
 * Push the chosen accent into CSS custom properties. The shared
 * `--primary` var is what every Tailwind utility ultimately reads from.
 */
function applyAccent(id: AccentId) {
  if (typeof document === "undefined") return;
  const def = ACCENTS[id] ?? ACCENTS.red;
  const root = document.documentElement;
  root.style.setProperty("--primary", def.hsl);
  root.style.setProperty("--ring", def.hsl);
  root.style.setProperty("--sidebar-primary", def.hsl);
  root.style.setProperty("--sidebar-ring", def.hsl);
}

export const useAccentStore = create<AccentState>()(
  persist(
    (set) => ({
      accent: "red",
      setAccent: (next) => {
        applyAccent(next);
        set({ accent: next });
      },
    }),
    {
      name: "bookmark-manager:accent",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state?.accent) applyAccent(state.accent);
      },
    },
  ),
);

/** Read + auto-apply hook — guarantees the chosen accent is on the
 *  document root every time a consumer mounts. */
export function useAccent() {
  const accent = useAccentStore((s) => s.accent);
  useEffect(() => applyAccent(accent), [accent]);
  return accent;
}

export function useSetAccent() {
  return useAccentStore((s) => s.setAccent);
}
