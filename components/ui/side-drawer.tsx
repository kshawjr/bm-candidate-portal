"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Drawer width — fixed CSS length or percent. Default 85vw on
   *  mobile leaves a visible sliver of background so "tap outside to
   *  close" reads as an option. Capped at 90vw via inline maxWidth. */
  width?: string;
  /** ARIA label for the dialog container. */
  ariaLabel?: string;
}

/**
 * Left-edge slide-in drawer. Sibling primitive to the BottomSheet
 * shipped in PR 118; same lock-scroll + Escape + drag-to-close +
 * prefers-reduced-motion fallback story, just on the X axis.
 *
 * Foundation for mobile navigation — wraps the existing desktop
 * sidebar content on mobile viewports so the cinematic shell can
 * stay a single component branching on width.
 */
export function SideDrawer({
  isOpen,
  onClose,
  children,
  width = "85vw",
  ariaLabel = "Navigation drawer",
}: SideDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="side-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            className="side-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            style={{ width, maxWidth: "90vw" }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80 || info.velocity.x < -500) {
                onClose();
              }
            }}
          >
            <div className="side-drawer-content">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
