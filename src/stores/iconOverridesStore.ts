/**
 * Per-host user-chosen icon overrides.
 *
 * The icon engine resolves the highest-quality favicon it can find — but
 * "highest quality" is a heuristic and the user is the final authority.
 * Settings → Site Icons lets the user pick any of the captured candidate
 * icons (or the generated letter avatar) for each host. This store
 * persists those choices.
 *
 * Persistence:
 *   • Stored in localStorage (Zustand persist middleware) — small,
 *     survives extension/web-app reloads, exports cleanly with the rest
 *     of the user's settings.
 *   • Zod-validated on rehydrate so a corrupt entry can never crash boot.
 *
 * Lookup contract:
 *   • Key is the lowercased, www-stripped hostname (matches gallery keys).
 *   • Value is the icon URL the user chose, ideally a `data:` URL but
 *     remote URLs are fine too.
 *   • A `null` / missing entry means "no override — let the engine pick".
 */

import { z } from "zod";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { logger } from "@/lib/logger";

const STORAGE_KEY = "bookmark-manager:icon-overrides:v1";

const OverrideSchema = z.object({
  /** What to render for this host. */
  url: z.string().min(1),
  /** Source label captured for diagnostics; never user-visible. */
  source: z.string().optional(),
  /** When the user picked this. */
  chosenAt: z.number(),
});

type IconOverride = z.infer<typeof OverrideSchema>;

interface OverridesState {
  /** hostname → override entry. Empty by default. */
  overrides: Record<string, IconOverride>;
  setOverride: (host: string, url: string, source?: string) => void;
  clearOverride: (host: string) => void;
  clearAll: () => void;
}

export const useIconOverridesStore = create<OverridesState>()(
  persist(
    (set) => ({
      overrides: {},
      setOverride: (host, url, source) => {
        const key = host.toLowerCase().replace(/^www\./, "");
        if (!key || !url) return;
        set((state) => ({
          overrides: {
            ...state.overrides,
            [key]: { url, source, chosenAt: Date.now() },
          },
        }));
      },
      clearOverride: (host) => {
        const key = host.toLowerCase().replace(/^www\./, "");
        if (!key) return;
        set((state) => {
          if (!(key in state.overrides)) return state;
          const rest = { ...state.overrides };
          delete rest[key];
          return { overrides: rest };
        });
      },
      clearAll: () => set({ overrides: {} }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ overrides: s.overrides }),
      // Validate on rehydrate so corrupt persisted state doesn't poison
      // the store. Anything that doesn't fit the schema is silently
      // dropped.
      merge: (persistedState, current) => {
        if (!persistedState || typeof persistedState !== "object") return current;
        const raw = persistedState as { overrides?: unknown };
        if (!raw.overrides || typeof raw.overrides !== "object") return current;
        const valid: Record<string, IconOverride> = {};
        for (const [k, v] of Object.entries(raw.overrides as Record<string, unknown>)) {
          const parsed = OverrideSchema.safeParse(v);
          if (parsed.success) valid[k] = parsed.data;
        }
        return { ...current, overrides: valid };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) logger.warn("[icon-overrides] rehydrate error", error);
      },
    },
  ),
);

/** Snapshot accessor — useful for non-React paths (e.g. icon resolver). */
export function getIconOverride(host: string): IconOverride | null {
  const key = host.toLowerCase().replace(/^www\./, "");
  if (!key) return null;
  return useIconOverridesStore.getState().overrides[key] ?? null;
}

/** Subscribe to changes for a single host. Returns unsubscribe. */
export function subscribeIconOverride(
  host: string,
  cb: (entry: IconOverride | null) => void,
): () => void {
  const key = host.toLowerCase().replace(/^www\./, "");
  return useIconOverridesStore.subscribe((state, prev) => {
    const next = state.overrides[key] ?? null;
    const before = prev.overrides[key] ?? null;
    if (next?.url !== before?.url) cb(next);
  });
}

/** React hook — subscribes to a single host's override entry. */
export function useIconOverride(host: string | null | undefined): IconOverride | null {
  const key = (host ?? "").toLowerCase().replace(/^www\./, "");
  return useIconOverridesStore((s) => (key ? s.overrides[key] ?? null : null));
}

export const useIconOverrideActions = () =>
  useIconOverridesStore(
    useShallow((s) => ({
      setOverride: s.setOverride,
      clearOverride: s.clearOverride,
      clearAll: s.clearAll,
    })),
  );

export const useAllIconOverrides = () =>
  useIconOverridesStore((s) => s.overrides);
