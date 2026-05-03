"use client";

import { useEffect, useState } from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface Props {
  state: SaveState;
}

/**
 * Small pill that surfaces auto-save status to the candidate. Lives top-right
 * of the application form area (not viewport — the application's renderer
 * wraps it in a positioned container).
 *
 * Idle → hidden. Saving → "Saving…" with a tiny dot animation. Saved → green
 * tinted "✓ Saved" that auto-fades after 2s. Error → red tinted "Save error
 * — retrying" that stays until the next save attempt clears it.
 *
 * The 2s auto-fade for "saved" is implemented via a local `visible` flag
 * that the parent's state transitions reset. This way the indicator shows
 * crisply on every save instead of getting stuck after the first one.
 */
export function SaveIndicator({ state }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state === "idle") {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (state !== "saved") return;
    // "saved" is a transient confirmation; auto-fade after 2s. The next
    // saving/error transition cancels the pending timer via cleanup.
    const t = window.setTimeout(() => setVisible(false), 2000);
    return () => window.clearTimeout(t);
  }, [state]);

  if (!visible || state === "idle") return null;

  const cls = `save-indicator save-indicator-${state}`;
  let label = "";
  if (state === "saving") label = "Saving…";
  else if (state === "saved") label = "✓ Saved";
  else if (state === "error") label = "Save error — retrying";

  return (
    <div className={cls} role="status" aria-live="polite">
      {label}
    </div>
  );
}
