"use client";

import { useEffect, useRef, useState } from "react";

export interface ZipLocationValue {
  zip: string;
  derivedCity: string;
  derivedState: string;
  confirmed: "yes" | "no" | null;
  otherText: string;
  // When zippopotam.us fails or candidate types a non-US zip, we flip into a
  // manual-entry mode so the step isn't a dead end.
  manualFallback: boolean;
}

interface Props {
  value: ZipLocationValue;
  onChange: (v: ZipLocationValue) => void;
}

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" };

export function ZipLocationField({ value, onChange }: Props) {
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  // Ref used to cancel in-flight lookups when the user keeps typing. The
  // previous fetch's result is discarded if a newer lookup has started.
  const latestLookupId = useRef(0);

  useEffect(() => {
    const zip = value.zip.trim();
    if (!/^\d{5}$/.test(zip)) {
      // Clear any previously-derived city/state if the zip is no longer
      // valid. Keeps the UI from showing a stale city for a new zip.
      if (value.derivedCity || value.derivedState) {
        onChange({
          ...value,
          derivedCity: "",
          derivedState: "",
          confirmed: null,
        });
      }
      setLookup({ kind: "idle" });
      return;
    }
    // If we already have a resolved city for this zip, don't re-fetch.
    if (value.derivedCity && value.derivedState) {
      setLookup({ kind: "idle" });
      return;
    }
    // If the candidate flipped into manual fallback, don't fight them.
    if (value.manualFallback) return;

    const id = ++latestLookupId.current;
    setLookup({ kind: "loading" });
    fetch(`https://api.zippopotam.us/us/${zip}`)
      .then(async (res) => {
        if (id !== latestLookupId.current) return;
        if (!res.ok) throw new Error(`lookup ${res.status}`);
        const data = (await res.json()) as {
          places?: Array<{
            "place name"?: string;
            state?: string;
            "state abbreviation"?: string;
          }>;
        };
        const place = data.places?.[0];
        const city = (place?.["place name"] ?? "").trim();
        const stateAbbr = (place?.["state abbreviation"] ?? "").trim();
        if (!city || !stateAbbr) throw new Error("no place");
        onChange({
          ...value,
          derivedCity: city,
          derivedState: stateAbbr,
          confirmed: null,
          manualFallback: false,
        });
        setLookup({ kind: "idle" });
      })
      .catch(() => {
        if (id !== latestLookupId.current) return;
        setLookup({ kind: "error" });
      });
    // We deliberately depend only on `value.zip` — other field updates
    // shouldn't retrigger network calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.zip]);

  const hasValidZip = /^\d{5}$/.test(value.zip.trim());
  const hasDerived =
    hasValidZip && value.derivedCity.length > 0 && value.derivedState.length > 0;

  const enterManualMode = () => {
    onChange({
      ...value,
      manualFallback: true,
      derivedCity: "",
      derivedState: "",
      confirmed: null,
    });
    setLookup({ kind: "idle" });
  };

  return (
    <div className="zip-location">
      <label className="app-field-col">
        <span className="app-field-sublabel">What&apos;s your ZIP code?</span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={5}
          value={value.zip}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "").slice(0, 5);
            onChange({ ...value, zip: raw });
          }}
          placeholder="12345"
          className="app-field-input zip-input"
          autoFocus
        />
      </label>

      {hasValidZip && lookup.kind === "loading" && !value.manualFallback && (
        <div className="zip-lookup-status">Looking up your area…</div>
      )}

      {hasValidZip && lookup.kind === "error" && !value.manualFallback && (
        <div className="zip-lookup-error">
          <p>We couldn&apos;t look that one up. You can type it in instead.</p>
          <button
            type="button"
            className="app-nav-btn"
            onClick={enterManualMode}
          >
            Enter city &amp; state manually
          </button>
        </div>
      )}

      {hasDerived && !value.manualFallback && (
        <>
          <div className="zip-derived-card">
            <span className="zip-derived-eyebrow">Got it as</span>
            <span className="zip-derived-place">
              {value.derivedCity}, {value.derivedState}
            </span>
          </div>

          <div className="zip-confirm">
            <p className="zip-confirm-prompt">
              Is this where you want to open?
            </p>
            <div className="zip-confirm-toggle">
              <button
                type="button"
                className={`app-toggle${value.confirmed === "yes" ? " active" : ""}`}
                onClick={() =>
                  onChange({ ...value, confirmed: "yes", otherText: "" })
                }
              >
                Yes
              </button>
              <button
                type="button"
                className={`app-toggle${value.confirmed === "no" ? " active" : ""}`}
                onClick={() => onChange({ ...value, confirmed: "no" })}
              >
                No, somewhere else
              </button>
            </div>
            {value.confirmed === "no" && (
              <label className="app-followup-label">
                <span className="app-field-sublabel">
                  Where are you looking to open?
                </span>
                <input
                  type="text"
                  value={value.otherText}
                  onChange={(e) =>
                    onChange({ ...value, otherText: e.target.value })
                  }
                  className="app-field-input"
                  placeholder="City, state, region, or market description"
                />
              </label>
            )}
          </div>
        </>
      )}

      {value.manualFallback && (
        <div className="zip-manual">
          <div className="app-field-row zip-manual-row">
            <label className="app-field-col">
              <span className="app-field-sublabel">City</span>
              <input
                type="text"
                value={value.derivedCity}
                onChange={(e) =>
                  onChange({ ...value, derivedCity: e.target.value })
                }
                className="app-field-input"
                placeholder="Austin"
              />
            </label>
            <label className="app-field-col">
              <span className="app-field-sublabel">State</span>
              <input
                type="text"
                maxLength={2}
                value={value.derivedState}
                onChange={(e) =>
                  onChange({
                    ...value,
                    derivedState: e.target.value.toUpperCase().slice(0, 2),
                  })
                }
                className="app-field-input"
                placeholder="TX"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// Validator used by the renderer to know when the candidate can advance.
export function isZipLocationComplete(v: ZipLocationValue): boolean {
  if (v.manualFallback) {
    return v.derivedCity.trim().length > 0 && v.derivedState.trim().length > 0;
  }
  if (!/^\d{5}$/.test(v.zip.trim())) return false;
  if (!v.derivedCity || !v.derivedState) return false;
  if (v.confirmed === "yes") return true;
  if (v.confirmed === "no") return v.otherText.trim().length > 0;
  return false;
}
