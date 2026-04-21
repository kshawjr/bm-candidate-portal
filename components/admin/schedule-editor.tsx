"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ScheduleConfig } from "@/lib/schedule-shared";

interface Props {
  stepId: string;
  initialConfig: ScheduleConfig;
  advisorEmail: string | null;
  isGCalConfigured: boolean;
  serviceAccountEmail: string | null;
  testAdvisorCalendar: () => Promise<void>;
  saveConfig: (stepId: string, config: ScheduleConfig) => Promise<void>;
}

const DEFAULT_CONFIG: ScheduleConfig = {
  duration_minutes: 30,
  days_ahead: 14,
  start_hour: 9,
  end_hour: 17,
  timezone: "America/New_York",
  buffer_minutes: 15,
  body: "",
};

const DURATION_OPTIONS = [15, 30, 45, 60];
const BUFFER_OPTIONS = [0, 15, 30, 60];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);
const TZ_OPTIONS = [
  { value: "America/New_York", label: "Eastern (America/New_York)" },
  { value: "America/Chicago", label: "Central (America/Chicago)" },
  { value: "America/Denver", label: "Mountain (America/Denver)" },
  { value: "America/Phoenix", label: "Arizona (America/Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (America/Los_Angeles)" },
  { value: "America/Anchorage", label: "Alaska (America/Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Pacific/Honolulu)" },
];

function normalize(raw: unknown): ScheduleConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CONFIG };
  const r = raw as Record<string, unknown>;
  return {
    duration_minutes:
      typeof r.duration_minutes === "number"
        ? r.duration_minutes
        : DEFAULT_CONFIG.duration_minutes,
    days_ahead:
      typeof r.days_ahead === "number"
        ? Math.min(14, Math.max(1, r.days_ahead))
        : DEFAULT_CONFIG.days_ahead,
    start_hour:
      typeof r.start_hour === "number"
        ? r.start_hour
        : DEFAULT_CONFIG.start_hour,
    end_hour:
      typeof r.end_hour === "number" ? r.end_hour : DEFAULT_CONFIG.end_hour,
    timezone:
      typeof r.timezone === "string" ? r.timezone : DEFAULT_CONFIG.timezone,
    buffer_minutes:
      typeof r.buffer_minutes === "number"
        ? r.buffer_minutes
        : DEFAULT_CONFIG.buffer_minutes,
    body: typeof r.body === "string" ? r.body : "",
  };
}

function formatHour(h: number): string {
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${suffix}`;
}

export function ScheduleEditor({
  stepId,
  initialConfig,
  advisorEmail,
  isGCalConfigured,
  serviceAccountEmail,
  testAdvisorCalendar,
  saveConfig,
}: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<ScheduleConfig>(() =>
    normalize(initialConfig),
  );
  const [pending, startTransition] = useTransition();
  const [testing, startTesting] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setConfig(normalize(initialConfig));
  }, [initialConfig, stepId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const dirty =
    JSON.stringify(config) !== JSON.stringify(normalize(initialConfig));
  const hoursValid = config.start_hour < config.end_hour;

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      try {
        await saveConfig(stepId, config);
        setToast("Schedule saved");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const handleCopy = async () => {
    if (!serviceAccountEmail) return;
    try {
      await navigator.clipboard.writeText(serviceAccountEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in insecure contexts; fall back to a prompt
      // so the admin can copy manually.
      window.prompt("Copy this email:", serviceAccountEmail);
    }
  };

  const handleTest = () => {
    startTesting(async () => {
      try {
        await testAdvisorCalendar();
        setToast("✓ Calendar access confirmed");
      } catch (e) {
        setToast(
          e instanceof Error
            ? e.message
            : "Calendar not yet shared with service account — see instructions below",
        );
      }
    });
  };

  return (
    <div className="adm-schedule-editor">
      {!isGCalConfigured && (
        <div className="adm-notice">
          <div className="adm-notice-eyebrow">Calendar not connected</div>
          <p>
            Scheduling will appear as &ldquo;being set up&rdquo; to candidates
            until the Google service account is configured. See{" "}
            <code>docs/SCHEDULE_SETUP.md</code> for the one-time setup.
          </p>
        </div>
      )}

      <div className="adm-field">
        <span className="adm-form-label">Advisor calendar</span>
        <div className="adm-advisor-row">
          <div className="adm-advisor-email" aria-readonly="true">
            {advisorEmail || (
              <span className="adm-muted">
                No advisor email set for this brand.
              </span>
            )}
          </div>
          <button
            type="button"
            className="adm-btn-ghost"
            onClick={handleTest}
            disabled={
              !advisorEmail || !isGCalConfigured || testing || pending
            }
            title={
              !advisorEmail
                ? "Set an advisor email first"
                : !isGCalConfigured
                  ? "Google service account not configured"
                  : "Run a 24-hour freeBusy ping"
            }
          >
            {testing ? "Testing…" : "Test calendar access"}
          </button>
        </div>
        <span className="adm-form-hint">
          Edit the brand&apos;s advisor in the Brands admin (coming soon).
        </span>
      </div>

      {advisorEmail && (
        <div className="adm-callout">
          <div className="adm-callout-head">
            ⚠ One more step after saving
          </div>
          <p className="adm-callout-lede">
            For scheduling to work with this rep, their Google Calendar must
            be shared with our scheduling service account.
          </p>
          <div className="adm-callout-sa">
            <span className="adm-callout-sa-label">Service account email</span>
            <div className="adm-callout-sa-row">
              <code className="adm-callout-sa-email">
                {serviceAccountEmail || (
                  <span className="adm-muted">
                    Not configured — see docs/SCHEDULE_SETUP.md
                  </span>
                )}
              </code>
              {serviceAccountEmail && (
                <button
                  type="button"
                  className="adm-btn-ghost"
                  onClick={handleCopy}
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              )}
            </div>
          </div>
          <p className="adm-callout-lede">
            Send this email to the rep with these instructions:
          </p>
          <ol className="adm-callout-steps">
            <li>Open Google Calendar.</li>
            <li>
              Hover over your calendar name → three dots →{" "}
              <strong>Settings and sharing</strong>.
            </li>
            <li>
              Scroll to <strong>Share with specific people or groups</strong>.
            </li>
            <li>
              Click <strong>Add people and groups</strong>.
            </li>
            <li>Paste the service account email above.</li>
            <li>
              Permission: <strong>Make changes to events</strong>.
            </li>
            <li>
              Click <strong>Send</strong>.
            </li>
          </ol>
          <p className="adm-callout-foot">
            Once they confirm, hit <strong>Test calendar access</strong>{" "}
            above to verify.
          </p>
        </div>
      )}

      <label className="adm-field">
        <span className="adm-form-label">Body</span>
        <textarea
          className="adm-textarea"
          rows={3}
          value={config.body ?? ""}
          onChange={(e) => setConfig({ ...config, body: e.target.value })}
          placeholder="Optional copy shown above the slot picker"
        />
      </label>

      <div className="adm-schedule-row">
        <label className="adm-field" style={{ flex: 1 }}>
          <span className="adm-form-label">Duration</span>
          <select
            className="adm-input"
            value={config.duration_minutes}
            onChange={(e) =>
              setConfig({
                ...config,
                duration_minutes: parseInt(e.target.value, 10),
              })
            }
          >
            {DURATION_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </label>
        <label className="adm-field" style={{ flex: 1 }}>
          <span className="adm-form-label">Days ahead</span>
          <input
            type="number"
            className="adm-input"
            min={1}
            max={14}
            value={config.days_ahead}
            onChange={(e) =>
              setConfig({
                ...config,
                days_ahead: Math.min(
                  14,
                  Math.max(1, parseInt(e.target.value, 10) || 14),
                ),
              })
            }
          />
          <span className="adm-form-hint">Max 14 days.</span>
        </label>
      </div>

      <div className="adm-schedule-row">
        <label className="adm-field" style={{ flex: 1 }}>
          <span className="adm-form-label">Start of day</span>
          <select
            className="adm-input"
            value={config.start_hour}
            onChange={(e) =>
              setConfig({ ...config, start_hour: parseInt(e.target.value, 10) })
            }
          >
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-field" style={{ flex: 1 }}>
          <span className="adm-form-label">End of day</span>
          <select
            className="adm-input"
            value={config.end_hour}
            onChange={(e) =>
              setConfig({ ...config, end_hour: parseInt(e.target.value, 10) })
            }
          >
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!hoursValid && (
        <div className="adm-form-error adm-form-error-inline">
          Start of day must be before end of day.
        </div>
      )}

      <div className="adm-schedule-row">
        <label className="adm-field" style={{ flex: 1 }}>
          <span className="adm-form-label">Timezone</span>
          <select
            className="adm-input"
            value={config.timezone}
            onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
          >
            {TZ_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-field" style={{ flex: 1 }}>
          <span className="adm-form-label">Buffer between bookings</span>
          <select
            className="adm-input"
            value={config.buffer_minutes}
            onChange={(e) =>
              setConfig({
                ...config,
                buffer_minutes: parseInt(e.target.value, 10),
              })
            }
          >
            {BUFFER_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "No buffer" : `${n} minutes`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="adm-form-error adm-form-error-inline">{error}</div>
      )}

      <div className="adm-video-save">
        <button
          type="button"
          className="adm-btn-primary"
          onClick={handleSave}
          disabled={!dirty || !hoursValid || pending}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      {toast && <div className="adm-toast">{toast}</div>}
    </div>
  );
}
