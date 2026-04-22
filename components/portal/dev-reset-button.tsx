"use client";

import { useEffect, useState } from "react";
import {
  ResetCandidateModal,
  summarizeCounts,
} from "@/components/admin/reset-candidate-modal";
import type { ResetCounts } from "@/app/admin/candidates/actions";

interface Props {
  token: string;
}

/**
 * Floating reset pill, rendered bottom-right of the portal layout. Visible
 * only for test candidates — gated on a `test-` token prefix — so real
 * candidates never see it even in dev. The server action behind it also
 * requires admin auth; this button just gets the modal open.
 *
 * Positioned with absolute inside .portal-page (which is position: relative)
 * rather than position: fixed, so it stays inside the layout rather than
 * floating over whatever the candidate is reading.
 */
export function DevResetButton({ token }: Props) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!token.startsWith("test-")) return null;

  const handleSuccess = (counts: ResetCounts) => {
    setToast(summarizeCounts(counts));
  };

  return (
    <>
      <button
        type="button"
        className="portal-dev-reset"
        onClick={() => setOpen(true)}
        title="Reset this test candidate's progress"
      >
        <span aria-hidden="true">⟲</span>
        <span>Reset candidate</span>
      </button>

      {open && (
        <ResetCandidateModal
          token={token}
          candidateLabel={`Test candidate · ${token}`}
          onClose={() => setOpen(false)}
          onSuccess={handleSuccess}
        />
      )}

      {toast && <div className="portal-dev-toast">{toast}</div>}
    </>
  );
}
