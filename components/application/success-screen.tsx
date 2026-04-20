"use client";

interface Props {
  firstName: string;
  leaderName: string;
  onContinue: () => void;
}

export function SuccessScreen({ firstName, leaderName, onContinue }: Props) {
  return (
    <div className="app-screen app-success">
      <div className="app-success-icon" aria-hidden="true">
        ✓
      </div>
      <h2 className="app-success-title">
        Thanks, {firstName}! We&apos;ve got your application.
      </h2>

      <div className="app-success-next">
        <div className="app-success-next-heading">What happens next</div>
        <ul>
          <li>We&apos;ll review within 2 business days.</li>
          <li>
            {leaderName || "Your franchise growth leader"} will reach out to
            schedule a call.
          </li>
          <li>Your journey continues at Stop 2: Say hi.</li>
        </ul>
      </div>

      <button
        type="button"
        className="app-nav-btn primary app-success-continue"
        onClick={onContinue}
      >
        Continue to Stop 2 →
      </button>
    </div>
  );
}
