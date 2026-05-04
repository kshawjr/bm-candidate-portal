"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrResetTestCandidateAction } from "@/app/admin/candidates/actions";
import { getCorrectPortalUrl } from "@/lib/brand-from-hostname";
import type { TestCandidateStatus } from "@/lib/seed-test-candidate";

interface Props {
  candidates: TestCandidateStatus[];
}

export function TestCandidatesPanel({ candidates }: Props) {
  return (
    <section className="adm-test-candidates">
      <h2 className="adm-test-candidates-h2">Test Candidates</h2>
      <p className="admin-muted">
        Two stable tokens (Hounds Town + Cruisin&apos; Tikis) for previewing
        the candidate experience. <strong>Create</strong> if missing,{" "}
        <strong>Reset</strong> to wipe progress and start fresh.
      </p>
      <div className="adm-test-candidates-grid">
        {candidates.map((c) => (
          <TestCandidateCard key={c.token} candidate={c} />
        ))}
      </div>
    </section>
  );
}

function TestCandidateCard({ candidate }: { candidate: TestCandidateStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    | { kind: "ok"; text: string }
    | { kind: "err"; text: string }
    | null
  >(null);

  const handleClick = () => {
    setFeedback(null);
    startTransition(async () => {
      const result = await createOrResetTestCandidateAction(candidate.token);
      if (result.success) {
        setFeedback({ kind: "ok", text: result.message });
        router.refresh();
      } else {
        setFeedback({ kind: "err", text: result.message });
      }
    });
  };

  const actionLabel = candidate.exists ? "Reset" : "Create";

  return (
    <div className="adm-test-candidate-card">
      <div className="adm-test-candidate-head">
        <strong>{candidate.firstName}</strong>
        <span className="adm-test-candidate-brand">{candidate.brandSlug}</span>
      </div>
      <code className="adm-test-candidate-token">{candidate.token}</code>
      <div
        className={
          candidate.exists
            ? "adm-test-candidate-status exists"
            : "adm-test-candidate-status missing"
        }
      >
        {candidate.exists ? "Exists" : "Not yet created"}
      </div>
      <div className="adm-test-candidate-actions">
        <button
          type="button"
          className="adm-btn-primary"
          onClick={handleClick}
          disabled={pending}
        >
          {pending ? `${actionLabel.slice(0, -1)}ing…` : actionLabel}
        </button>
        <a
          href={getCorrectPortalUrl(candidate.token, candidate.brandSlug)}
          target="_blank"
          rel="noopener noreferrer"
          className="adm-btn-ghost"
        >
          Preview →
        </a>
      </div>
      {feedback && (
        <div
          className={
            feedback.kind === "ok"
              ? "adm-test-candidate-feedback ok"
              : "adm-test-candidate-feedback err"
          }
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}
