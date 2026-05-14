"use client";

import { useEffect, useState } from "react";

/**
 * Floating back-to-top button. Appears bottom-right once the page
 * has scrolled past 200px, smooth-scrolls back to top on click,
 * and fades out when the candidate is already at the top.
 *
 * Rendered once at the top of cinematic-shell so it's available on
 * every step. z-index 100 sits below the popup backdrop (1000) so a
 * transition video or chapter intro hides it cleanly while open.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className="back-to-top-btn"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: 44,
        height: 44,
        borderRadius: "50%",
        background: "rgba(255, 255, 255, 0.95)",
        border: "1px solid rgba(0, 0, 0, 0.1)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
        display: visible ? "flex" : "none",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        zIndex: 100,
        transition: "opacity 200ms ease-out, transform 200ms ease-out",
        opacity: visible ? 1 : 0,
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
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}
