"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Tap-able handle visible at the bottom of the viewport when the
   *  sheet is closed. Pass it to give the sheet an "always present"
   *  affordance (handle visible when closed, full sheet when open).
   *  Omit when the sheet should only exist while open (modal-style). */
  collapsedHandle?: React.ReactNode;
  /** Maximum height of the expanded sheet as a percentage of the
   *  viewport. Default 85 leaves a sliver of the underlying page
   *  visible, signaling the sheet is dismissible. */
  maxHeightPercent?: number;
  /** ARIA label for the dialog container. */
  ariaLabel?: string;
}

/**
 * Mobile-native bottom sheet. Foundation primitive — no call sites
 * yet. Subsequent mobile PRs (locked-cards rail, sidebar mobile,
 * schedule details, etc.) will consume this.
 *
 * Drag-to-close uses framer-motion's drag with a y-axis constraint.
 * Closes when the candidate drags past 100px OR releases at >500px/s
 * velocity. Body scroll locks while open; Escape closes. Backdrop
 * tap closes. prefers-reduced-motion disables the motion animations
 * via the matching CSS (.bottom-sheet / .bottom-sheet-backdrop).
 */
export function BottomSheet({
  isOpen,
  onClose,
  children,
  collapsedHandle,
  maxHeightPercent = 85,
  ariaLabel = "Bottom sheet",
}: BottomSheetProps) {
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
    <>
      {collapsedHandle && !isOpen && (
        <div className="bottom-sheet-handle-container">{collapsedHandle}</div>
      )}

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="bottom-sheet-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              aria-hidden="true"
            />

            <motion.div
              className="bottom-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              style={{ maxHeight: `${maxHeightPercent}vh` }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100 || info.velocity.y > 500) {
                  onClose();
                }
              }}
            >
              <div
                className="bottom-sheet-drag-indicator"
                aria-hidden="true"
              />
              <div className="bottom-sheet-content">{children}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
