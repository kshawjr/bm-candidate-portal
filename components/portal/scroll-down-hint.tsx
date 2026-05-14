"use client";

import { useEffect, useState } from "react";

/**
 * Scroll-down discovery hint. Paired with BackToTop (PR 108):
 * BackToTop helps candidates get back UP, this helps them know
 * there's MORE content DOWN.
 *
 * Two layers — both gated on smart detection:
 *   - Soft gradient fade at the bottom of the viewport (passive)
 *   - Bouncing chevron above it, clickable to scroll one viewport
 *     height (active)
 *
 * Both render only when the page is actually scrollable past a
 * 50px threshold (so a page that's barely-scrollable from padding
 * doesn't show a misleading hint) AND the candidate hasn't scrolled
 * yet. Once they scroll >50px, the hint hides permanently for this
 * mount — every step change remounts the shell so the hint
 * re-evaluates on the new page.
 */
export function ScrollDownHint() {
  const [hasContent, setHasContent] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const checkContent = () => {
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight > 50;
      setHasContent(scrollable);
    };

    // Defer the first check so images / late-loading content have
    // a chance to expand the page height before we measure.
    const timeoutId = window.setTimeout(checkContent, 100);
    window.addEventListener("resize", checkContent);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", checkContent);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 50) {
        setHasScrolled(true);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollDown = () => {
    window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
  };

  if (!hasContent || hasScrolled) return null;

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 100,
          background:
            "linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.85))",
          pointerEvents: "none",
          zIndex: 50,
          transition: "opacity 300ms ease-out",
        }}
      />

      <button
        type="button"
        onClick={scrollDown}
        aria-label="Scroll down to see more content"
        className="scroll-down-hint"
        style={{
          position: "fixed",
          bottom: 32,
          left: "50%",
          transform: "translateX(-50%)",
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "rgba(255, 255, 255, 0.95)",
          border: "1px solid rgba(0, 0, 0, 0.1)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 75,
          animation: "scroll-hint-bounce 2s ease-in-out infinite",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </>
  );
}
