"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ScheduleConfig } from "@/lib/schedule-shared";

interface Props {
  stepId: string;
  initialConfig: ScheduleConfig;
  isGCalConfigured: boolean;
  saveConfig: (stepId: string, config: ScheduleConfig) => Promise<void>;
}

const DEFAULT_CONFIG: ScheduleConfig = {
  duration_minutes: 60,
  days_ahead: 14,
  start_hour: 9,
  end_hour: 17,
  timezone: "America/New_York",
  buffer_minutes: 0,
  body: "",
  event_label: "Discovery Call",
  working_days: [1, 2, 3, 4, 5],
  min_notice_hours: 24,
};

const DURATION_OPTIONS = [15, 30, 45, 60];
const BUFFER_OPTIONS = [0, 15, 30, 60];
const NOTICE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "No minimum" },
  { value: 4, label: "4 hours" },
  { value: 12, label: "12 hours" },
  { value: 24, label: "1 day" },
  { value: 48, label: "2 days" },
  { value: 72, label: "3 days" },
];
// Match the calendar header order (Sunday-start) for visual consistency.
const WEEKDAY_LABELS: Array<{ dow: number; label: string }> = [
  { dow: 0, label: "Sun" },
  { dow: 1, label: "Mon" },
  { dow: 2, label: "Tue" },
  { dow: 3, label: "Wed" },
  { dow: 4, label: "Thu" },
  { dow: 5, label: "Fri" },
  { dow: 6, label: "Sat" },
];
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
  const workingDays = Array.isArray(r.working_days)
    ? (r.working_days as unknown[]).filter(
        (n): n is number =>
          typeof n === "number" && n >= 0 && n <= 6 && Number.isInteger(n),
      )
    : null;
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
    event_label:
      typeof r.event_label === "string" && r.event_label.trim().length > 0
        ? r.event_label.trim()
        : DEFAULT_CONFIG.event_label,
    working_days:
      workingDays && workingDays.length > 0
        ? workingDays
        : DEFAULT_CONFIG.working_days,
    min_notice_hours:
      typeof r.min_notice_hours === "number"
        ? r.min_notice_hours
        : DEFAULT_CONFIG.min_notice_hours,
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
  isGCalConfigured,
  saveConfig,
}: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<ScheduleConfig>(() =>
    normalize(initialConfig),
  );
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      <div className="adm-notice">
        <div className="adm-notice-eyebrow">How this step routes</div>
        <p>
          This step books on the <strong>candidate&apos;s assigned rep&apos;s</strong>{" "}
          calendar — not a brand-wide advisor. For this demo, all test
          candidates are assigned to <strong>Kevin Shaw</strong>. Real
          reps and the rep admin UI land in a later PR.
        </p>
      </div>

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

      <label className="adm-field">
        <span className="adm-form-label">Event label</span>
        <input
          type="text"
          className="adm-input"
          value={config.event_label}
          onChange={(e) =>
            setConfig({ ...config, event_label: e.target.value })
          }
          placeholder="Discovery Call"
        />
        <span className="adm-form-hint">
          Used in the Google Calendar event title for parsing. Examples:
          &ldquo;Discovery Call&rdquo;, &ldquo;FDD Review Call&rdquo;.
        </span>
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

      <div className="adm-schedule-row">
        <label className="adm-field" style={{ flex: 1 }}>
          <span className="adm-form-label">Minimum notice</span>
          <select
            className="adm-input"
            value={config.min_notice_hours}
            onChange={(e) =>
              setConfig({
                ...config,
                min_notice_hours: parseInt(e.target.value, 10),
              })
            }
          >
            {NOTICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="adm-form-hint">
            Candidates can&apos;t book slots that start inside this window.
          </span>
        </label>
        <div className="adm-field" style={{ flex: 1 }}>
          <span className="adm-form-label">Days bookable</span>
          <div className="adm-day-toggles">
            {WEEKDAY_LABELS.map(({ dow, label }) => {
              const isOn = config.working_days.includes(dow);
              return (
                <label
                  key={dow}
                  className={`adm-day-toggle${isOn ? " on" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={() => {
                      const next = isOn
                        ? config.working_days.filter((d) => d !== dow)
                        : [...config.working_days, dow].sort((a, b) => a - b);
                      setConfig({ ...config, working_days: next });
                    }}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </div>
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
