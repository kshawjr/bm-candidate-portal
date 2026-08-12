"use client";

import { useState } from "react";
import { OptOutModal } from "@/components/portal/opt-out-modal";
import type { OptOutReason } from "@/lib/opt-out";

interface Props {
  /** Candidate's current chapter index (0-based). Link renders only for
   *  the education chapters (0 and 1: explore + first_chat). Hidden from
   *  chapter 3 onward — by then the candidate is meaningfully committed
   *  and an opt-out CTA would compete with the deeper-funnel steps. */
  currentChapterIdx: number;
  onOptOut: (reason: OptOutReason) => Promise<{ success: boolean; error?: string }>;
}

const MAX_CHAPTER_IDX_FOR_OPT_OUT = 1;

/**
 * Fixed-position footer link that opens the opt-out modal. Matches the
 * visual weight of BackToTop / ScrollDownHint — muted, in the corner,
 * doesn't compete with the primary step CTAs. Hidden past the education
 * chapters (see MAX_CHAPTER_IDX_FOR_OPT_OUT).
 */
export function OptOutFooterLink({ currentChapterIdx, onOptOut }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  if (currentChapterIdx > MAX_CHAPTER_IDX_FOR_OPT_OUT) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          position: "fixed",
          bottom: 20,
          left: 24,
          background: "rgba(255, 255, 255, 0.9)",
          border: "1px solid rgba(0, 0, 0, 0.08)",
          borderRadius: 999,
          padding: "8px 14px",
          fontSize: 13,
          color: "#6b7280",
          cursor: "pointer",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
          fontFamily: "inherit",
          zIndex: 100,
          lineHeight: 1.2,
        }}
      >
        Not interested in this opportunity?{" "}
        <span style={{ color: "var(--brand-primary, #2563eb)" }}>→</span>
      </button>
      {isOpen && (
        <OptOutModal
          onCancel={() => setIsOpen(false)}
          onConfirm={onOptOut}
        />
      )}
    </>
  );
}
