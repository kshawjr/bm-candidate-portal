"use client";

import { useEffect, useState } from "react";

/**
 * Tracks whether the viewport is at mobile width (≤768px by default).
 *
 * SSR-safe: returns `null` on first render so the server-rendered
 * markup never disagrees with the client about mobile-vs-desktop
 * layout. After mount the value settles to true/false and stays in
 * sync with viewport changes via matchMedia.
 *
 * Consumers should treat `null` as "unknown" — either render a layout
 * that works at any width, or short-circuit until the value resolves.
 * Never branch on `!isMobile` for the unknown state since that lumps
 * "loading" and "desktop" into the same path.
 *
 * Pure foundation primitive. No call sites yet — subsequent mobile
 * PRs (cinematic shell mobile pass, application mobile pass, etc.)
 * will consume this.
 */
export function useIsMobile(breakpoint: number = 768): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}
