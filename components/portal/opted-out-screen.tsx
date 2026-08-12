"use client";

import { useTransition, useState } from "react";

interface Props {
  brandName: string;
  onReengage: () => Promise<{ success: boolean; error?: string }>;
}

/**
 * Shown in place of the cinematic shell when the candidate has opted
 * out (candidates_in_portal.opted_out_at is set). Provides a single
 * reengage CTA that clears the opt-out timestamp and creates a Zoho
 * task for the rep. On success the parent page re-renders and the
 * normal portal resumes at the candidate's last position — no
 * interstitial "thanks" screen per product decision (would feel like a
 * barrier when the candidate is trying to come back).
 */
export function OptedOutScreen({ brandName, onReengage }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleReengage = () => {
    setError(null);
    startTransition(async () => {
      const result = await onReengage();
      if (!result.success) {
        setError(result.error ?? "Something went wrong. Try again.");
      }
      // Success path: server action revalidates the portal route, page
      // re-renders with opted_out_at cleared, and this component
      // unmounts — the candidate lands back on their last step.
    });
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f9fafb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "var(--font-body, system-ui), system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          background: "#ffffff",
          borderRadius: 18,
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.08)",
          padding: "40px 32px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-heading, var(--font-body, system-ui))",
            fontWeight: "var(--heading-weight, 600)",
            fontSize: 28,
            lineHeight: 1.2,
            color: "#111827",
            margin: 0,
          }}
        >
          Thanks for letting us know
        </h1>
        <p
          style={{
            marginTop: 16,
            fontSize: 15,
            lineHeight: 1.6,
            color: "#4b5563",
          }}
        >
          We&apos;ve closed out your {brandName} portal. Your franchise
          development team has been notified, and they won&apos;t reach
          out unless you ask them to.
        </p>

        <div
          style={{
            marginTop: 32,
            paddingTop: 28,
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "#6b7280",
            }}
          >
            Change your mind?
          </p>
          <button
            type="button"
            className="pp-popup-cta"
            onClick={handleReengage}
            disabled={pending}
            style={{ marginTop: 14 }}
          >
            {pending ? "Reconnecting…" : "Reconnect with our team →"}
          </button>
          {error && (
            <p
              role="alert"
              style={{
                marginTop: 14,
                color: "#b91c1c",
                fontSize: 13,
              }}
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
