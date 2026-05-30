import { memo, useEffect, useState } from "react";
import { motion } from "framer-motion";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAnimationMultiplier } from "@/stores/uiPrefsStore";

function formatTime(date: Date) {
  let h = date.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return {
    hours: h.toString().padStart(2, "0"),
    minutes: date.getMinutes().toString().padStart(2, "0"),
    seconds: date.getSeconds().toString().padStart(2, "0"),
    ampm,
  };
}

function ClockImpl() {
  const animationMultiplier = useAnimationMultiplier();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Align ticks to wall-clock seconds so the seconds field updates exactly
    // on the second instead of drifting based on mount time.
    const drift = 1000 - (Date.now() % 1000);
    let interval: ReturnType<typeof setInterval> | undefined;
    const align = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 1000);
    }, drift);
    return () => {
      clearTimeout(align);
      if (interval) clearInterval(interval);
    };
  }, []);

  const { hours, minutes, seconds, ampm } = formatTime(now);
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = now.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex flex-col items-center">
      <div
        className="flex items-center gap-1 font-mono text-lg font-semibold text-foreground/80"
        aria-label={`Current time ${hours}:${minutes} ${ampm}`}
        aria-live="off"
      >
        <motion.span
          key={`h-${hours}`}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300 / animationMultiplier, damping: 20 }}
        >
          {hours}
        </motion.span>
        <span className="animate-pulse" aria-hidden>:</span>
        <motion.span
          key={`m-${minutes}`}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300 / animationMultiplier, damping: 20 }}
        >
          {minutes}
        </motion.span>
        <span className="animate-pulse text-xs opacity-50" aria-hidden>:</span>
        <motion.span
          key={`s-${seconds}`}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="text-primary"
        >
          {seconds}
        </motion.span>
        <span className="text-xs ml-1 font-sans text-muted-foreground">{ampm}</span>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium hover:text-primary transition-colors cursor-pointer mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
            title="View Calendar"
          >
            {dayName}, {dateStr}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 rounded-2xl neu-raised border-border/50 shadow-xl"
          align="center"
        >
          <Calendar mode="single" selected={now} className="rounded-xl p-3" />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export const Clock = memo(ClockImpl);
Clock.displayName = "Clock";
