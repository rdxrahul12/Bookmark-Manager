/**
 * Icon customizer — Settings → Site Icons.
 *
 * Lets the user pick which favicon variant the resolver should use for
 * each bookmark site. Renders one row per host, each row showing every
 * candidate the engine has ever successfully probed for that host plus
 * a generated letter-avatar slot for "fall back to initials".
 *
 * Interaction model:
 *   • Clicking any candidate sets it as the override and persists.
 *   • Clicking the currently-selected candidate clears the override
 *     (returns to engine-auto). Subtle but discoverable via aria-pressed
 *     state and tooltips.
 *   • A "Refresh" button per row re-runs the resolver with `forceRefresh`
 *     so new candidates appear if the auto cache went stale.
 *   • Search filters the host list. Sticky header keeps the search bar
 *     visible while scrolling.
 *
 * Performance:
 *   • Gallery rows are loaded lazily — only when the dialog opens. We
 *     read every host once via `Promise.all` and stash the result in
 *     local state for the lifetime of the dialog.
 *   • Each row mounts its own image probes lazily via `loading="lazy"`
 *     so a long bookmark list doesn't stampede the network.
 *   • Refreshing one row never blocks the others.
 *
 * Accessibility:
 *   • The candidate strip is a `radiogroup` so screen readers announce
 *     "1 of N selected".
 *   • Each candidate gets descriptive aria-labels including the source
 *     name and dimensions.
 *   • Keyboard: arrow-key navigation within a row (handled by Radix
 *     RadioGroup primitive in the underlying button structure — we
 *     keep tab-stops minimal so power users sweep through hosts).
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, RefreshCw, RotateCcw, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getHostname } from "@/lib/url";
import {
  GalleryEntry,
  galleryKeyFor,
  iconGallery,
  makeAvatarDataUrl,
  resolveBestIcon,
} from "@/utils/iconEngine";
import { useBookmarks } from "@/stores/bookmarksStore";
import {
  useAllIconOverrides,
  useIconOverrideActions,
} from "@/stores/iconOverridesStore";

interface IconCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HostRow {
  host: string;
  /** Display title — uses the most-frequent bookmark title for that host. */
  title: string;
  /** A representative URL (first bookmark for the host) — used for refresh. */
  representativeUrl: string;
  /** Number of bookmarks on this host (for the count badge). */
  count: number;
}

/** Special URL marker for the "use generated letter avatar" option. */
const AVATAR_MARKER = "@@avatar";

// ─── Helpers ────────────────────────────────────────────────────────────

/** Group bookmarks by host, returning one row per unique host. */
function buildHostRows(
  bookmarks: ReadonlyArray<{ url: string; title: string }>,
): HostRow[] {
  const byHost = new Map<string, HostRow>();
  for (const b of bookmarks) {
    const host = getHostname(b.url);
    if (!host) continue;
    const existing = byHost.get(host);
    if (existing) {
      existing.count += 1;
    } else {
      byHost.set(host, {
        host,
        title: b.title,
        representativeUrl: b.url,
        count: 1,
      });
    }
  }
  // Stable alphabetical order so the user can always find a host quickly.
  return Array.from(byHost.values()).sort((a, b) =>
    a.host.localeCompare(b.host),
  );
}

/** Pretty-print a candidate's source label for tooltips. */
function describeSource(source: string): string {
  if (source.startsWith("override:")) return "Curated override";
  if (source.startsWith("manifest")) return "From manifest.json";
  if (source.startsWith("html:apple-touch")) return "Apple touch icon";
  if (source.startsWith("html:icon") || source.startsWith("html:shortcut")) {
    return "From <link rel=\"icon\">";
  }
  if (source.startsWith("html:")) return "From page HTML";
  if (source.startsWith("ext:")) return "Live DOM (extension)";
  if (source.startsWith("apex:")) return "Apex domain";
  if (source.startsWith("site:")) return "Site-hosted path";
  if (source.startsWith("google-s2")) return "Google";
  if (source.startsWith("icon-horse")) return "icon.horse";
  if (source.startsWith("clearbit")) return "Clearbit";
  if (source.startsWith("brandfetch")) return "Brandfetch";
  if (source.startsWith("logo-dev")) return "Logo.dev";
  if (source.startsWith("duckduckgo")) return "DuckDuckGo";
  if (source.startsWith("yandex")) return "Yandex";
  return source;
}

/**
 * Group key for visual dedup. Icons sharing this key are almost
 * certainly the same image. We pick the highest-scored one per group.
 *
 * Resizing services return identical content for adjacent sizes (Google
 * s2 at 192 and 256 both serve the same upstream PNG), so without dedup
 * the customizer fills with 30+ near-identical chips. Grouping on
 * `(serviceFamily, roundedSize)` collapses those to one chip per
 * dimension bucket per service.
 */
function visualDedupKey(entry: GalleryEntry): string {
  const family = entry.source
    .replace(/^extra:/, "")
    .replace(/^apex:/, "")
    .replace(/^override:/, "")
    .replace(/^html:/, "html-")
    .replace(/^manifest.*/, "manifest")
    .replace(/^site:.*/, "site")
    .replace(/-\d+$/, "") // drop trailing -size suffix from extra:* sources
    .split("-")
    .slice(0, 2)
    .join("-");
  // Round dimensions to the nearest power-of-2-ish bucket so 144 and 152
  // (both effectively "medium") collapse together.
  const minSide = Math.min(entry.width || 0, entry.height || 0);
  let bucket = 0;
  if (minSide >= 384) bucket = 512;
  else if (minSide >= 192) bucket = 256;
  else if (minSide >= 128) bucket = 192;
  else if (minSide >= 96) bucket = 128;
  else if (minSide >= 64) bucket = 96;
  else if (minSide >= 48) bucket = 64;
  else if (minSide >= 32) bucket = 32;
  else bucket = 16;
  return `${family}@${bucket}`;
}

/** Reduce a flat entries list to one entry per visual group. */
function dedupVisually(entries: GalleryEntry[]): GalleryEntry[] {
  const byGroup = new Map<string, GalleryEntry>();
  for (const entry of entries) {
    const key = visualDedupKey(entry);
    const prior = byGroup.get(key);
    if (!prior || entry.score > prior.score) {
      byGroup.set(key, entry);
    }
  }
  return Array.from(byGroup.values()).sort((a, b) => b.score - a.score);
}

// ─── Single host row ────────────────────────────────────────────────────

interface HostRowCardProps {
  row: HostRow;
  entries: GalleryEntry[];
  selectedUrl: string | null;
  onSelect: (host: string, url: string, source?: string) => void;
  onClear: (host: string) => void;
  onRefresh: (row: HostRow) => Promise<void>;
  refreshing: boolean;
}

const HostRowCard = memo(function HostRowCard({
  row,
  entries,
  selectedUrl,
  onSelect,
  onClear,
  onRefresh,
  refreshing,
}: HostRowCardProps) {
  const avatarUrl = useMemo(() => makeAvatarDataUrl(row.host), [row.host]);
  // The avatar choice is logically `selectedUrl === avatarUrl`. We store
  // the actual data URL so the override survives reloads.
  const isAvatarSelected = selectedUrl === avatarUrl;
  const hasOverride = selectedUrl !== null;

  const handleClickIcon = useCallback(
    (url: string, source: string) => {
      // Toggle: clicking the active selection clears the override.
      if (selectedUrl === url) {
        onClear(row.host);
      } else {
        onSelect(row.host, url, source);
      }
    },
    [row.host, selectedUrl, onClear, onSelect],
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4"
    >
      {/* Host header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate" title={row.title}>
            {row.title}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {row.host}
            {row.count > 1 && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {row.count} bookmarks
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasOverride && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => onClear(row.host)}
                  aria-label={`Reset icon for ${row.host} to automatic`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Reset to auto
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => onRefresh(row)}
                disabled={refreshing}
                aria-label={`Refresh icons for ${row.host}`}
              >
                {refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Re-fetch candidates
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Candidate strip */}
      <div
        role="radiogroup"
        aria-label={`Choose icon for ${row.host}`}
        className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1"
      >
        {/* Generated avatar — always present so the user has a guaranteed
            "no logo" fallback even when no candidates loaded. */}
        <IconChip
          imageUrl={avatarUrl}
          label={`Letter avatar (${(row.host.charAt(0) || "?").toUpperCase()})`}
          tooltip="Letter avatar"
          subLabel="Letter"
          selected={isAvatarSelected}
          onClick={() => handleClickIcon(avatarUrl, AVATAR_MARKER)}
        />

        {entries.length === 0 ? (
          <div className="flex-1 text-xs text-muted-foreground italic px-2 py-3">
            {refreshing
              ? "Discovering icons…"
              : "No icons captured yet. Click refresh to scan this site."}
          </div>
        ) : (
          entries.map((entry) => {
            const dim =
              entry.width && entry.height
                ? `${Math.round(entry.width)}×${Math.round(entry.height)}`
                : "Icon";
            return (
              <IconChip
                key={entry.url}
                imageUrl={entry.url}
                label={`${describeSource(entry.source)} (${dim})`}
                tooltip={`${describeSource(entry.source)}\n${dim}`}
                subLabel={dim}
                selected={selectedUrl === entry.url}
                onClick={() => handleClickIcon(entry.url, entry.source)}
              />
            );
          })
        )}
      </div>
    </motion.div>
  );
});

// ─── Single icon chip ───────────────────────────────────────────────────

interface IconChipProps {
  imageUrl: string;
  label: string;
  tooltip: string;
  subLabel: string;
  selected: boolean;
  onClick: () => void;
}

const IconChip = memo(function IconChip({
  imageUrl,
  label,
  tooltip,
  subLabel,
  selected,
  onClick,
}: IconChipProps) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          aria-label={label}
          onClick={onClick}
          className={cn(
            "group relative flex flex-col items-center gap-1 shrink-0 rounded-xl border-2 p-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            selected
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-transparent bg-secondary/30 hover:border-border hover:bg-secondary/60",
          )}
        >
          <div className="relative h-10 w-10 sm:h-11 sm:w-11 rounded-lg overflow-hidden bg-white dark:bg-zinc-800 ring-1 ring-black/5 dark:ring-white/10">
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain p-1"
            />
            {selected && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center bg-primary/85"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.15 }}
              >
                <Check className="h-4 w-4 text-primary-foreground" />
              </motion.div>
            )}
          </div>
          <span className="text-[10px] leading-none text-muted-foreground max-w-[3.5rem] truncate">
            {subLabel}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs whitespace-pre-line max-w-[180px]">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
});

// ─── Main customizer ────────────────────────────────────────────────────

export function IconCustomizer({ isOpen, onClose }: IconCustomizerProps) {
  const bookmarks = useBookmarks();
  const overrides = useAllIconOverrides();
  const { setOverride, clearOverride, clearAll } = useIconOverrideActions();

  const [galleries, setGalleries] = useState<Record<string, GalleryEntry[]>>(
    {},
  );
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [loadingInitial, setLoadingInitial] = useState(false);
  const fetchTokenRef = useRef(0);

  const rows = useMemo(() => buildHostRows(bookmarks), [bookmarks]);

  // Filter rows by the search term against host or title.
  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.host.toLowerCase().includes(term) ||
        r.title.toLowerCase().includes(term),
    );
  }, [rows, search]);

  // Load every host's gallery + auto-refresh on open.
  //
  // The cache only stores the winner, so a fresh dialog open would
  // initially show one icon per row (the cached winner) until we
  // re-probe. We:
  //   1. Read existing gallery entries from IndexedDB synchronously
  //      so the UI paints immediately with whatever was captured before.
  //   2. Subscribe to live `iconGallery` updates per host so newly
  //      probed icons append to each row in real time.
  //   3. Kick off `resolveBestIcon(forceRefresh: true)` for every row
  //      in batches of 4, which re-runs every probe and streams
  //      candidates into the gallery via the subscription.
  useEffect(() => {
    if (!isOpen) return;
    const token = ++fetchTokenRef.current;
    setLoadingInitial(true);

    // Track all live subscriptions so we can clean up on close / token rotate.
    const unsubscribers: Array<() => void> = [];
    let cancelled = false;

    (async () => {
      // 1. Initial read.
      const seeds = await Promise.all(
        rows.map(async (row) => {
          const key = galleryKeyFor(row.representativeUrl) || row.host;
          const entries = await iconGallery.list(key);
          return [row.host, entries] as const;
        }),
      );
      if (cancelled || token !== fetchTokenRef.current) return;
      setGalleries(Object.fromEntries(seeds));
      setLoadingInitial(false);

      // 2. Live subscriptions — append newly probed icons in real time.
      for (const row of rows) {
        const key = galleryKeyFor(row.representativeUrl) || row.host;
        const unsubscribe = iconGallery.subscribe(key, (entries) => {
          if (token !== fetchTokenRef.current) return;
          setGalleries((g) => ({ ...g, [row.host]: entries }));
        });
        unsubscribers.push(unsubscribe);
      }

      // 3. Auto-refresh — re-run every probe so the full candidate set
      //    surfaces without the user having to click Refresh per row.
      runBackgroundFill(rows, token);
    })();

    return () => {
      cancelled = true;
      for (const u of unsubscribers) u();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, rows]);

  /** Resolve `targets` in batches of 4. Each probe streams candidates
   *  into the gallery, which the live subscription then merges into UI
   *  state — so the user sees icons appear as they're discovered, not
   *  in one bulk write at the end. */
  const runBackgroundFill = useCallback(
    async (targets: HostRow[], token: number) => {
      if (targets.length === 0) return;
      const BATCH = 4;
      for (let i = 0; i < targets.length; i += BATCH) {
        if (token !== fetchTokenRef.current) return;
        const batch = targets.slice(i, i + BATCH);
        setRefreshing((s) => {
          const next = { ...s };
          for (const row of batch) next[row.host] = true;
          return next;
        });
        await Promise.all(
          batch.map(async (row) => {
            try {
              // forceRefresh: true bypasses Tier-0 cache so we re-probe
              // every candidate. discover: true probes ~100 extra
              // candidates (every public CDN at every reasonable size,
              // every iOS apple-touch size, common alternative paths)
              // so the customizer offers the widest possible choice set.
              await resolveBestIcon(row.representativeUrl, {
                forceRefresh: true,
                discover: true,
              });
            } catch {
              /* resolver never throws; defensive */
            }
          }),
        );
        if (token !== fetchTokenRef.current) return;
        setRefreshing((s) => {
          const next = { ...s };
          for (const row of batch) delete next[row.host];
          return next;
        });
      }
    },
    [],
  );

  const handleSelect = useCallback(
    (host: string, url: string, source?: string) => {
      setOverride(host, url, source);
    },
    [setOverride],
  );

  const handleClear = useCallback(
    (host: string) => {
      clearOverride(host);
    },
    [clearOverride],
  );

  const handleRefresh = useCallback(
    async (row: HostRow) => {
      setRefreshing((s) => ({ ...s, [row.host]: true }));
      try {
        // forceRefresh re-runs every probe. Each probe is recorded by
        // the resolver into iconGallery, which fans out to the row's
        // live subscription — so new icons stream in as they resolve,
        // no manual re-fetch needed. discover: true also probes the
        // wide-net ~100 extra candidates.
        await resolveBestIcon(row.representativeUrl, {
          forceRefresh: true,
          discover: true,
        });
      } finally {
        setRefreshing((s) => {
          const rest = { ...s };
          delete rest[row.host];
          return rest;
        });
      }
    },
    [],
  );

  const overrideCount = Object.keys(overrides).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Site Icons"
      description="Pick the favicon variant for each site. Choose any captured icon, or fall back to the letter avatar."
      contentClassName="!max-w-2xl"
      className="!max-w-2xl"
    >
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 -mx-6 px-6 pb-3 pt-1 mb-3 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by site or title…"
              className="pl-9 pr-9 h-9"
              aria-label="Filter sites"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {overrideCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs h-9"
                  onClick={() => clearAll()}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Reset all
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Clear {overrideCount} icon override{overrideCount === 1 ? "" : "s"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Click any icon to select it. Click the selected one again to return to automatic.
        </p>
      </div>

      {/* Body */}
      <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1 -mr-1">
        {loadingInitial ? (
          <div className="py-10 flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading icon gallery…
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {search
              ? "No sites match your search."
              : "Add a bookmark to start customizing icons."}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visibleRows.map((row) => {
              const key = galleryKeyFor(row.representativeUrl) || row.host;
              const rawEntries = galleries[key] ?? galleries[row.host] ?? [];
              // Dedup visually-identical results so the user sees one chip
              // per "real" icon — discovery yields many adjacent-size
              // variants of the same upstream image.
              const entries = dedupVisually(rawEntries);
              const override = overrides[row.host] ?? overrides[key];
              return (
                <HostRowCard
                  key={row.host}
                  row={row}
                  entries={entries}
                  selectedUrl={override?.url ?? null}
                  onSelect={handleSelect}
                  onClear={handleClear}
                  onRefresh={handleRefresh}
                  refreshing={!!refreshing[row.host]}
                />
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </Modal>
  );
}
