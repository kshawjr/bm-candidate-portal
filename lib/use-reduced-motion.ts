"use client";

import { useEffect, useState } from "react";

// React hook for `prefers-reduced-motion: reduce`. Starts at `false`
// so SSR matches the most common "motion OK" default — flips on the
// first client effect if the OS-level preference is set.
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reduce;
}
