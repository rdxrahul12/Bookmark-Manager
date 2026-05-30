/**
 * SearchOverlay — Spotlight-inspired global search.
 *
 * Visual model
 *   • Whole page sits behind a single full-viewport scrim. The scrim is
 *     `backdrop-filter: blur(...)` so everything underneath softens
 *     uniformly without a class-flip on the page tree (no reflow, no
 *     ancestor change). That's what makes the open feel buttery.
 *   • A centered "command card" floats above the scrim. Apple-style:
 *     rounded-3xl, thick frosted material, paper-thin border, gentle
 *     drop shadow.
 *   • Card scales from 0.96 + fades in over ~180 ms with a critically
 *     damped spring; backdrop fades in parallel. On close everything
 *     reverses with the same curve so it feels symmetrical.
 *
 * Interaction
 *   • ⌘K / Ctrl+K toggles. Escape closes.
 *   • Arrow keys move the active result; Enter opens it in a new tab.
 *   • Click on the backdrop closes; clicks inside the card don't.
 *   • Search matches title OR any substring of the URL (case-insensitive).
 *
 * Accessibility
 *   • role="dialog" + aria-modal, labelled by the sr-only heading.
 *   • Input auto-focuses on open; focus is restored on close.
 *   • Active option flagged via aria-activedescendant so VoiceOver
 *     announces the highlighted bookmark as you arrow through.
 */

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";

import { Bookmark, Category } from "@/types/bookmark";
import { Favicon } from "./Favicon";
import { cn } from "@/lib/utils";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarks: Bookmark[];
  categories: Category[];
}

/** Cap visible results so the list never grows unbounded on a huge library. */
const MAX_RESULTS = 60;

// ─── Helpers ────────────────────────────────────────────────────────────

/** Case-insensitive substring match against title and full URL. */
function matchesQuery(bookmark: Bookmark, term: string): boolean {
  return (
    bookmark.title.toLowerCase().includes(term) ||
    bookmark.url.toLowerCase().includes(term)
  );
}

/**
 * Highlight all occurrences of `term` inside `text` with <mark> spans.
 * Plain string matching — fine for short titles / URLs and avoids any
 * regex-injection footguns from user input.
 */
function highlight(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const lower = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = lower.indexOf(lowerTerm, i);
    if (idx === -1) {
      out.push(text.slice(i));
      break;
    }
    if (idx > i) out.push(text.slice(i, idx));
    out.push(
      <mark
        key={`m-${key++}`}
        className="bg-primary/20 text-foreground rounded-[3px] px-0.5"
      >
        {text.slice(idx, idx + term.length)}
      </mark>,
    );
    i = idx + term.length;
  }
  return <>{out}</>;
}

// ─── Component ──────────────────────────────────────────────────────────

function SearchOverlayImpl({
  isOpen,
  onClose,
  bookmarks,
  categories,
}: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const listboxId = useId();

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  // Compute results. Empty query shows the most-recently-created
  // bookmarks so the overlay is never blank — same idea as macOS
  // Spotlight surfacing recent items.
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const source = term
      ? bookmarks.filter((b) => matchesQuery(b, term))
      : [...bookmarks].sort((a, b) => b.createdAt - a.createdAt);
    return source.slice(0, MAX_RESULTS);
  }, [bookmarks, query]);

  // Keep the highlight inside bounds whenever the result set shifts.
  useEffect(() => {
    setActiveIndex((i) => {
      if (results.length === 0) return 0;
      if (i >= results.length) return results.length - 1;
      if (i < 0) return 0;
      return i;
    });
  }, [results]);

  // Reset transient state every time the overlay opens; restore focus on close.
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedRef.current =
        (document.activeElement as HTMLElement) ?? null;
      setQuery("");
      setActiveIndex(0);
      // Lock background scroll while the overlay is up so the blurred
      // page can't drift behind the modal during inertial scrolls.
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      // Slight delay so the input focus doesn't fight the open animation.
      const focusTimer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
      return () => {
        window.clearTimeout(focusTimer);
        document.body.style.overflow = previousOverflow;
      };
    }
    // On close: hand focus back to whoever opened us (the trigger button)
    // so keyboard users land in a sensible place.
    previouslyFocusedRef.current?.focus?.();
  }, [isOpen]);

  // Open a single bookmark and close the palette. Defined once, used by
  // click + Enter handlers.
  const openBookmark = useCallback(
    (bookmark: Bookmark) => {
      window.open(bookmark.url, "_blank", "noopener,noreferrer");
      onClose();
    },
    [onClose],
  );

  // Keyboard handling lives on the form so it captures keys regardless
  // of whether the input or list has visible focus.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (results.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % results.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + results.length) % results.length);
      } else if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(results.length - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const target = results[activeIndex];
        if (target) openBookmark(target);
      }
    },
    [results, activeIndex, onClose, openBookmark],
  );

  // Smooth-scroll the active row into view when arrowing past the
  // visible window.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const activeEl = list.querySelector<HTMLElement>(
      `[data-result-index="${activeIndex}"]`,
    );
    if (!activeEl) return;
    activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="search-overlay"
          className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[14vh] pb-6"
          role="dialog"
          aria-modal="true"
          aria-label="Search bookmarks"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
        >
          {/* Backdrop — single layer doing the heavy lifting. The
              backdrop-blur class blurs whatever's underneath, so the
              entire page softens without us touching the page tree. */}
          <button
            type="button"
            aria-label="Close search"
            tabIndex={-1}
            onClick={onClose}
            className={cn(
              "absolute inset-0 w-full h-full cursor-default",
              "bg-background/55 dark:bg-background/70",
              "backdrop-blur-xl backdrop-saturate-150",
            )}
          />

          {/* Command card */}
          <motion.div
            className={cn(
              "relative w-full max-w-2xl rounded-3xl overflow-hidden",
              "bg-card/85 dark:bg-card/85 backdrop-blur-2xl backdrop-saturate-150",
              "border border-border/50",
              "shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.04)_inset]",
            )}
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 32,
              mass: 0.6,
            }}
            onKeyDown={handleKeyDown}
          >
            {/* Search row */}
            <div className="flex items-center gap-3 px-5 h-14 border-b border-border/40">
              <Search
                className="h-5 w-5 text-muted-foreground shrink-0"
                aria-hidden
              />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search bookmarks by name or link…"
                aria-label="Search bookmarks"
                aria-controls={listboxId}
                aria-activedescendant={
                  results[activeIndex]
                    ? `${listboxId}-${results[activeIndex].id}`
                    : undefined
                }
                spellCheck={false}
                autoComplete="off"
                className={cn(
                  "flex-1 bg-transparent border-0 outline-none",
                  "text-base sm:text-[1.05rem] text-foreground",
                  "placeholder:text-muted-foreground/70",
                  "[appearance:none] [&::-webkit-search-cancel-button]:hidden",
                )}
              />
              <AnimatePresence mode="popLayout" initial={false}>
                {query && (
                  <motion.button
                    key="clear"
                    type="button"
                    onClick={() => {
                      setQuery("");
                      inputRef.current?.focus();
                    }}
                    aria-label="Clear search"
                    className="h-7 w-7 flex items-center justify-center rounded-full bg-secondary/80 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    initial={{ opacity: 0, scale: 0.6, rotate: -45 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.6, rotate: 45 }}
                    transition={{ type: "spring", stiffness: 500, damping: 28 }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Result list */}
            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label="Bookmark results"
              className="max-h-[55vh] overflow-y-auto py-2 no-scrollbar"
            >
              {results.length === 0 ? (
                <div className="py-14 px-6 text-center">
                  <Search className="h-7 w-7 mx-auto mb-3 text-muted-foreground/50" aria-hidden />
                  <p className="text-sm font-medium text-foreground/85">
                    {query.trim()
                      ? "No bookmarks match your search"
                      : "Type to search your bookmarks"}
                  </p>
                  {query.trim() && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Try another keyword or part of a URL
                    </p>
                  )}
                </div>
              ) : (
                <ul className="px-2">
                  {results.map((bookmark, index) => {
                    const category = categoryById.get(bookmark.category);
                    const isActive = index === activeIndex;
                    return (
                      <li
                        key={bookmark.id}
                        id={`${listboxId}-${bookmark.id}`}
                        role="option"
                        aria-selected={isActive}
                        data-result-index={index}
                        onMouseMove={() => setActiveIndex(index)}
                        onClick={() => openBookmark(bookmark)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer",
                          "transition-colors duration-150",
                          isActive
                            ? "bg-primary/10 text-foreground"
                            : "hover:bg-secondary/60 text-foreground/90",
                        )}
                      >
                        <Favicon
                          url={bookmark.url}
                          title={bookmark.title}
                          size={32}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {highlight(bookmark.title, query.trim())}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {highlight(bookmark.url, query.trim())}
                          </p>
                        </div>
                        {category && (
                          <span
                            className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/70 text-[10px] font-medium text-muted-foreground shrink-0"
                            aria-label={`Category ${category.name}`}
                          >
                            <span aria-hidden>{category.emoji}</span>
                            {category.name}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export const SearchOverlay = memo(SearchOverlayImpl);
SearchOverlay.displayName = "SearchOverlay";
