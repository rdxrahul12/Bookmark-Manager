/**
 * Favicon — three-track icon renderer with user-override support.
 *
 *   Track A — synchronous `<img>` ladder. Picks the most reliable public
 *             service first so the slot is *never* empty. On `<img onError>`
 *             we step down the ladder.
 *   Track B — async multi-source resolver (`@/utils/iconEngine`). Probes 30+
 *             sources in parallel + scrapes the page HTML, scores them, and
 *             upgrades our `src` to the highest-quality candidate. Result is
 *             cached as a `data:` URL so subsequent renders are instant.
 *   Track C — generated SVG avatar. The terminal fallback when literally
 *             nothing else loads. Always succeeds.
 *
 * **User override.** Settings → Site Icons lets the user pick any of the
 * resolver's candidate icons (or the generated avatar) for a given host.
 * When an override exists, it takes absolute precedence — we render it
 * immediately and skip the resolver entirely. This makes the user's
 * choice instant and stable.
 */

import { memo, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { useAnimationMultiplier } from "@/stores/uiPrefsStore";
import { cn } from "@/lib/utils";
import { getHostname } from "@/lib/url";
import { resolveBestIcon, IconResult, makeAvatarDataUrl } from "@/utils/iconEngine";
import { useIconOverride } from "@/stores/iconOverridesStore";

interface FaviconProps {
  url: string;
  title: string;
  size?: number;
  className?: string;
}

// ─────────── Default fallback ladder ───────────
//
// What we render *before* the parallel resolver finishes. Order matters —
// these have to look "right enough" on first paint or the user perceives
// the lag as broken.
//
//   1. icon.horse — actually parses the page, so for subdomains like
//      Gmail/LeetCode it returns the real product icon. Slowest of the four
//      but typically the most accurate when it works.
//   2. Google s2 — best worldwide coverage, fastest CDN, returns at least a
//      small placeholder for nearly every public domain.
//   3. DuckDuckGo — independent cache, sometimes catches what Google missed.
//   4. The site's own /favicon.ico — last resort because it 404s frequently.
function buildFallbackLadder(hostname: string): string[] {
  if (!hostname) return [];
  return [
    `https://icon.horse/icon/${hostname}`,
    `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
    `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
    `https://${hostname}/favicon.ico`,
  ];
}

// ─────────── Component ───────────

function FaviconImpl({ url, title, size = 40, className }: FaviconProps) {
  const animationMultiplier = useAnimationMultiplier();
  const hostname = getHostname(url);
  const radius = `${size * 0.225}px`;

  // User-chosen override always wins. Subscribes to changes so the grid
  // updates the instant the user picks a new icon in Settings.
  const override = useIconOverride(hostname);

  const avatar = useMemo(() => makeAvatarDataUrl(hostname || "?"), [hostname]);
  const ladder = useMemo(() => buildFallbackLadder(hostname), [hostname]);

  // Index into the synchronous ladder. Advances on every `<img onError>`.
  const [ladderIdx, setLadderIdx] = useState(0);

  // Best result from the resolver. Wins over the ladder once available.
  const [resolved, setResolved] = useState<IconResult | null>(null);

  // Reset on URL change. Skip the resolver entirely when an override is
  // active — the user's choice is the truth.
  useEffect(() => {
    setLadderIdx(0);
    setResolved(null);
    if (!url) return;
    if (override?.url) return;

    let cancelled = false;
    resolveBestIcon(url, {
      onProgress: (result) => {
        if (cancelled) return;
        // Stream higher-scoring results into the UI as they arrive.
        setResolved((current) =>
          current === null || result.score > current.score ? result : current,
        );
      },
    })
      .then((finalResult) => {
        if (cancelled || !finalResult) return;
        setResolved((current) =>
          current === null || finalResult.score >= current.score
            ? finalResult
            : current,
        );
      })
      .catch(() => {
        // resolver never rejects, but stay defensive
      });

    return () => {
      cancelled = true;
    };
  }, [url, override?.url]);

  // Pick the best src we have right now. Order:
  //   1. user override (absolute)
  //   2. resolver result
  //   3. synchronous ladder
  //   4. generated avatar
  const src = (() => {
    if (override?.url) return override.url;
    if (resolved) return resolved.url;
    if (ladderIdx < ladder.length) return ladder[ladderIdx];
    return avatar;
  })();

  const handleError = () => {
    // Override images shouldn't fail (most are persisted as data: URLs),
    // but if one does we fall back through the normal pipeline.
    if (override?.url && src === override.url) {
      // Surface the next-best source. Don't auto-clear the override —
      // that's a user decision, not ours.
      if (resolved) {
        // resolver already finished; let the ladder take over below.
        setResolved(null);
      } else if (ladderIdx < ladder.length) {
        setLadderIdx((i) => i + 1);
      }
      return;
    }
    if (resolved) {
      // Resolver result failed.
      // For data URLs, dropping is wrong — they don't fail in the wild.
      // For remote URLs, drop and let the ladder take over while the
      // resolver eventually retries on the next mount.
      if (!resolved.url.startsWith("data:")) {
        setResolved(null);
      }
      return;
    }
    if (ladderIdx < ladder.length) {
      setLadderIdx((i) => i + 1);
    }
  };

  const isPlaceholder = src === avatar;

  return (
    <motion.div
      className={cn(
        "relative overflow-hidden bg-secondary/30 shrink-0 shadow-sm backdrop-blur-sm transition-shadow duration-300",
        className,
      )}
      style={{ width: size, height: size, borderRadius: radius }}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 * animationMultiplier }}
    >
      <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-zinc-800">
        <img
          src={src}
          alt={`${title} favicon`}
          loading="lazy"
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={handleError}
          className={cn(
            "w-full h-full object-contain p-[10%] drop-shadow-sm transition-opacity duration-300",
            isPlaceholder ? "opacity-90" : "opacity-100",
          )}
        />
      </div>
      <div
        className="absolute inset-0 ring-1 ring-black/5 dark:ring-white/10 pointer-events-none"
        style={{ borderRadius: radius }}
      />
    </motion.div>
  );
}

export const Favicon = memo(FaviconImpl);
Favicon.displayName = "Favicon";
