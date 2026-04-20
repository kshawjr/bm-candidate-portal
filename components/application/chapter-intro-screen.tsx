"use client";

interface Props {
  eyebrow: string;
  body: string;
  onContinue: () => void;
  progressPct: number;
}

export function ChapterIntroScreen({
  eyebrow,
  body,
  onContinue,
  progressPct,
}: Props) {
  return (
    <div className="app-screen">
      <div className="app-progress">
        <div className="app-progress-bar">
          <div
            className="app-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="app-progress-meta">{eyebrow}</div>
      </div>

      <div className="app-chapter-intro">
        <p>{body}</p>
        <button
          type="button"
          className="app-nav-btn primary"
          onClick={onContinue}
        >
          Got it →
        </button>
      </div>
    </div>
  );
}
