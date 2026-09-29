"use client";

import { useEffect, useRef, type CSSProperties } from "react";

interface Props {
  /** Brand primary colour (brands.colors.primary). The splash
   *  background is this colour at full strength; the text colour on it
   *  is picked for contrast. Falls back to the inherited --brand-primary
   *  CSS var when missing. */
  brandPrimaryColor?: string | null;
  /** Runs the slides renderer's finish() — step transition video (if
   *  any) → "Setting things up…" loader → application step. */
  onContinue: () => void;
  disabled?: boolean;
}

const DARK_TEXT = "#1a1a1a";
const LIGHT_TEXT = "#ffffff";

function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Pick the text colour for content sitting on a brand fill. Everything
 * on the splash is sized as WCAG "large text" (heading ≥36px bold,
 * sub-line ≥24px, button border/focus ring are non-text UI), so AA
 * needs 3:1. White is preferred; if white can't reach 3:1 on this
 * brand's colour (e.g. Cruisin' Tikis coral #f86e4f → 2.86:1) we
 * switch to near-black instead.
 */
export function pickOnColor(bg: string | null | undefined): string {
  const rgb = bg ? parseHex(bg) : null;
  if (!rgb) return LIGHT_TEXT;
  const l = luminance(rgb);
  const white = contrast(1, l);
  if (white >= 3) return LIGHT_TEXT;
  const dark = contrast(luminance(parseHex(DARK_TEXT)!), l);
  return dark > white ? DARK_TEXT : LIGHT_TEXT;
}

/**
 * Full-screen "Nice work!" moment shown when the candidate finishes the
 * brand tour. Replaces the tour view (the slides renderer renders this
 * instead of the slides). A single Continue button hands off to finish().
 */
export function TourCompletionSplash({
  brandPrimaryColor,
  onContinue,
  disabled = false,
}: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Move keyboard / screen-reader focus to the only action on screen.
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  const style = {
    ...(brandPrimaryColor ? { "--tour-splash-bg": brandPrimaryColor } : {}),
    "--tour-splash-fg": pickOnColor(brandPrimaryColor),
  } as CSSProperties;

  return (
    <div
      className="tour-splash"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-splash-heading"
      aria-describedby="tour-splash-sub"
      style={style}
      onKeyDown={(e) => {
        // One focusable element — keep Tab from escaping to the page
        // behind the overlay.
        if (e.key === "Tab") {
          e.preventDefault();
          buttonRef.current?.focus();
        }
      }}
    >
      <div className="tour-splash-inner">
        <h2 id="tour-splash-heading" className="tour-splash-heading">
          Nice work!
        </h2>
        <p id="tour-splash-sub" className="tour-splash-sub">
          Ready to tell us about yourself?
        </p>
        <button
          ref={buttonRef}
          type="button"
          className="tour-splash-cta"
          onClick={onContinue}
          disabled={disabled}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
