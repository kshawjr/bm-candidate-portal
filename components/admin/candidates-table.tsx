"use client";

import { useEffect, useState } from "react";
import {
  ResetCandidateModal,
  summarizeCounts,
} from "./reset-candidate-modal";
import type { ResetCounts } from "@/app/admin/candidates/actions";

export interface CandidateRow {
  token: string;
  candidateId: string;
  name: string;
  email: string;
  brandName: string;
  chapterLabel: string | null;
  chapterNumber: number;
  stepNumber: number;
  lastActivityAt: string | null;
  isTest: boolean;
  liquidCapitalLabel: string | null;
  netWorthLabel: string | null;
  creditScoreLabel: string | null;
  /** Comma-separated motivation chip labels (PR 37: now multi-select). */
  motivationLabel: string | null;
  /** PR 37: short free-text follow-up that contextualises motivation chips. */
  motivationElaboration: string | null;
  /** PR 37: per-brand closing question response. */
  brandClosingLabel: string | null;
  zipCode: string | null;
  derivedPlace: string | null;
  targetConfirmed: boolean | null;
  targetOther: string | null;
  /** PR 37: bankruptcy moved into background-check section. */
  bankruptcyAnswer: boolean | null;
  bankruptcyExplanation: string | null;
  /** PR 37: new felony question alongside bankruptcy. */
  felonyAnswer: boolean | null;
  felonyExplanation: string | null;
  /** PR 37: free-text overrides for the chip questions that gained Other. */
  openingTimelineOther: string | null;
  involvementLevelOther: string | null;
  growthPlanOther: string | null;
}

interface Props {
  rows: CandidateRow[];
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString();
}

function yesNo(answer: boolean | null, explanation: string | null): string | null {
  if (answer === null) return null;
  if (answer === false) return "No";
  return explanation ? `Yes — ${explanation}` : "Yes";
}

export function CandidatesTable({ rows }: Props) {
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const activeRow = resetToken
    ? rows.find((r) => r.token === resetToken) ?? null
    : null;

  const handleSuccess = (counts: ResetCounts) => {
    setToast(summarizeCounts(counts));
  };

  if (rows.length === 0) {
    return (
      <div className="adm-cardlist-empty">
        <p>No candidates yet. Test tokens will appear here as you seed them.</p>
      </div>
    );
  }

  return (
    <>
      <table className="adm-candidates-table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Candidate</th>
            <th>Brand</th>
            <th>Position</th>
            <th>Location</th>
            <th>About</th>
            <th>Financials</th>
            <th>Background</th>
            <th>Last activity</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const locationParts: string[] = [];
            if (r.derivedPlace) {
              locationParts.push(
                r.zipCode ? `${r.derivedPlace} (${r.zipCode})` : r.derivedPlace,
              );
            } else if (r.zipCode) {
              locationParts.push(r.zipCode);
            }
            const targetLine =
              r.targetConfirmed === true
                ? "Same area"
                : r.targetConfirmed === false
                  ? r.targetOther
                    ? `Target: ${r.targetOther}`
                    : "Different area"
                  : null;

            const aboutBits: string[] = [];
            if (r.motivationLabel) aboutBits.push(`Why: ${r.motivationLabel}`);
            if (r.motivationElaboration)
              aboutBits.push(`More: ${r.motivationElaboration}`);
            if (r.openingTimelineOther)
              aboutBits.push(`Timing other: ${r.openingTimelineOther}`);
            if (r.involvementLevelOther)
              aboutBits.push(`Hands-on other: ${r.involvementLevelOther}`);
            if (r.growthPlanOther)
              aboutBits.push(`Growth other: ${r.growthPlanOther}`);
            if (r.brandClosingLabel)
              aboutBits.push(`Closing: ${r.brandClosingLabel}`);

            const bankruptcy = yesNo(r.bankruptcyAnswer, r.bankruptcyExplanation);
            const felony = yesNo(r.felonyAnswer, r.felonyExplanation);

            return (
              <tr key={r.token} className={r.isTest ? "is-test" : undefined}>
                <td>
                  <code className="adm-candidates-token">{r.token}</code>
                  {r.isTest && (
                    <span className="structure-chip" style={{ marginLeft: 8 }}>
                      Test
                    </span>
                  )}
                </td>
                <td>
                  <div>{r.name || "(no name)"}</div>
                  {r.email && (
                    <div className="adm-muted adm-candidates-sub">{r.email}</div>
                  )}
                </td>
                <td>{r.brandName}</td>
                <td>
                  Chapter {r.chapterNumber} · Step {r.stepNumber}
                  {r.chapterLabel && (
                    <div className="adm-muted adm-candidates-sub">
                      {r.chapterLabel}
                    </div>
                  )}
                </td>
                <td>
                  {locationParts.length > 0 || targetLine ? (
                    <div className="adm-candidates-financials">
                      {locationParts.map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                      {targetLine && (
                        <div className="adm-muted adm-candidates-sub">
                          {targetLine}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="adm-muted">—</span>
                  )}
                </td>
                <td>
                  {aboutBits.length > 0 ? (
                    <div className="adm-candidates-financials">
                      {aboutBits.map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  ) : (
                    <span className="adm-muted">—</span>
                  )}
                </td>
                <td>
                  {r.liquidCapitalLabel || r.netWorthLabel || r.creditScoreLabel ? (
                    <div className="adm-candidates-financials">
                      {r.liquidCapitalLabel && (
                        <div>Liq: {r.liquidCapitalLabel}</div>
                      )}
                      {r.netWorthLabel && (
                        <div>NW: {r.netWorthLabel}</div>
                      )}
                      {r.creditScoreLabel && (
                        <div>Credit: {r.creditScoreLabel}</div>
                      )}
                    </div>
                  ) : (
                    <span className="adm-muted">—</span>
                  )}
                </td>
                <td>
                  {bankruptcy || felony ? (
                    <div className="adm-candidates-financials">
                      {bankruptcy && <div>Bk: {bankruptcy}</div>}
                      {felony && <div>Felony: {felony}</div>}
                    </div>
                  ) : (
                    <span className="adm-muted">—</span>
                  )}
                </td>
                <td>{formatRelative(r.lastActivityAt)}</td>
                <td style={{ textAlign: "right" }}>
                  <button
                    type="button"
                    className="adm-btn-ghost adm-btn-danger"
                    onClick={() => setResetToken(r.token)}
                  >
                    Reset
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {activeRow && (
        <ResetCandidateModal
          token={activeRow.token}
          candidateLabel={`${activeRow.name || "(no name)"} · ${activeRow.brandName}`}
          onClose={() => setResetToken(null)}
          onSuccess={handleSuccess}
        />
      )}

      {toast && <div className="adm-toast">{toast}</div>}
    </>
  );
}
