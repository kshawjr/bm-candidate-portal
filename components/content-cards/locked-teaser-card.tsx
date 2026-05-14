// Placeholder card rendered in place of a gated content card whose
// unlock_key the candidate doesn't yet hold AND whose admin config
// opted in to a teaser (show_locked_teaser: true). Cards configured
// without a teaser simply don't render — see lib/card-visibility.ts.
//
// Visual treatment: same outer dimensions as a real card so the
// layout doesn't shift when the card unlocks. Muted background, lock
// icon, single line of teaser copy. A subtle shimmer animation hints
// "something's coming" without being noisy.

interface Props {
  teaserText: string;
}

export function LockedTeaserCard({ teaserText }: Props) {
  return (
    <div className="cc-card cc-locked-teaser" aria-label={teaserText}>
      <div className="cc-locked-teaser-inner">
        <svg
          className="cc-locked-teaser-icon"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span className="cc-locked-teaser-text">{teaserText}</span>
      </div>
    </div>
  );
}
