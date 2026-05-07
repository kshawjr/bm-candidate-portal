"use client";

interface Props {
  body: string;
  onContinue: () => void;
}

export function ChapterIntroScreen({ body, onContinue }: Props) {
  return (
    <div className="app-screen">
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
