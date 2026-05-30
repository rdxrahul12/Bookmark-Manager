// Detects whether a single-line text element is being clipped by CSS truncation
// (line-clamp / text-overflow). Returns a ref to attach to the element plus a
// reactive boolean. Uses ResizeObserver so the value stays accurate when the
// container resizes (window resize, sidebar toggles, font-loading reflows).
//
// `content` is the dependency that triggers a re-check when the text itself
// changes — ResizeObserver fires on box resize, but if text content changes
// while the element keeps the same size, RO won't notice.

import { useEffect, useRef, useState } from "react";

export function useIsTruncated<T extends HTMLElement>(content: string) {
  const ref = useRef<T | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => {
      // +1 absorbs sub-pixel rounding differences across zoom levels.
      const overflowsX = el.scrollWidth > el.clientWidth + 1;
      const overflowsY = el.scrollHeight > el.clientHeight + 1;
      setIsTruncated(overflowsX || overflowsY);
    };

    check();

    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [content]);

  return { ref, isTruncated };
}
