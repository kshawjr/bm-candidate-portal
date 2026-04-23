"use client";

import { useRef, type KeyboardEvent } from "react";

// Per-field input components for the light application. Each takes a `value`
// and an `onChange`, and renders its own label/layout. Screens compose these
// inside <QuestionScreen>.

interface FieldProps<T> {
  value: T | undefined;
  onChange: (v: T) => void;
}

export function ShortTextField({
  value,
  onChange,
  placeholder,
}: FieldProps<string> & { placeholder?: string }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="app-field-input"
      autoFocus
    />
  );
}

export function LongTextField({
  value,
  onChange,
  placeholder,
  hint,
}: FieldProps<string> & { placeholder?: string; hint?: string }) {
  return (
    <div>
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="app-field-textarea"
        rows={5}
        autoFocus
      />
      {hint && <p className="app-field-hint">{hint}</p>}
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  desc?: string;
}

export function SingleSelectField({
  value,
  onChange,
  options,
}: FieldProps<string> & { options: SelectOption[] }) {
  return (
    <div className="app-select-list">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`app-select-option${active ? " active" : ""}`}
            onClick={() => onChange(opt.value)}
          >
            <span className="app-select-label">{opt.label}</span>
            {opt.desc && <span className="app-select-desc">{opt.desc}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Pill-shaped chip group selector. Same data shape as SingleSelectField but
// rendered as a horizontal radiogroup that wraps on narrow screens. Used by
// the financial check section where the visual feel should be lighter than
// the stacked-button select used elsewhere.
export function ChipGroupField({
  value,
  onChange,
  options,
  ariaLabel,
}: FieldProps<string> & { options: SelectOption[]; ariaLabel: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIdx = options.findIndex((o) => o.value === value);

  const focusAndSelect = (i: number) => {
    const next = (i + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusAndSelect(i + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusAndSelect(i - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAndSelect(0);
        break;
      case "End":
        e.preventDefault();
        focusAndSelect(options.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div className="financial-chip-group" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt, i) => {
        const active = value === opt.value;
        // Roving tabindex: only the selected chip (or the first if none yet)
        // is in the tab order. Arrow keys move focus among the rest.
        const tabIndex = active || (selectedIdx === -1 && i === 0) ? 0 : -1;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={tabIndex}
            className={`financial-chip${active ? " selected" : ""}`}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export interface SelectWithOtherValue {
  value: string;
  otherText: string;
}

export function SingleSelectWithOtherField({
  value,
  onChange,
  options,
  otherValue = "other",
  otherPlaceholder = "Tell us how…",
}: FieldProps<SelectWithOtherValue> & {
  options: SelectOption[];
  otherValue?: string;
  otherPlaceholder?: string;
}) {
  const selected = value?.value ?? "";
  const otherText = value?.otherText ?? "";
  return (
    <div className="app-select-list">
      {options.map((opt) => {
        const active = selected === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`app-select-option${active ? " active" : ""}`}
            onClick={() =>
              onChange({ value: opt.value, otherText: opt.value === otherValue ? otherText : "" })
            }
          >
            <span className="app-select-label">{opt.label}</span>
          </button>
        );
      })}
      {selected === otherValue && (
        <input
          type="text"
          value={otherText}
          onChange={(e) => onChange({ value: otherValue, otherText: e.target.value })}
          placeholder={otherPlaceholder}
          className="app-field-input app-followup"
          autoFocus
        />
      )}
    </div>
  );
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

export interface StateMetroValue {
  state: string;
  metro: string;
}

export function StateMetroField({
  value,
  onChange,
}: FieldProps<StateMetroValue>) {
  const state = value?.state ?? "";
  const metro = value?.metro ?? "";
  return (
    <div className="app-field-row">
      <label className="app-field-col">
        <span className="app-field-sublabel">State</span>
        <select
          value={state}
          onChange={(e) => onChange({ state: e.target.value, metro })}
          className="app-field-select"
        >
          <option value="">Select…</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="app-field-col">
        <span className="app-field-sublabel">Metro area</span>
        <input
          type="text"
          value={metro}
          onChange={(e) => onChange({ state, metro: e.target.value })}
          placeholder="e.g. Austin, Seattle…"
          className="app-field-input"
        />
      </label>
    </div>
  );
}

export interface YesNoWithFollowupValue {
  answer: "yes" | "no" | null;
  note: string;
}

export function YesNoWithFollowupField({
  value,
  onChange,
  followupLabel,
}: FieldProps<YesNoWithFollowupValue> & { followupLabel: string }) {
  const answer = value?.answer ?? null;
  const note = value?.note ?? "";
  return (
    <div>
      <div className="app-toggle-row">
        <button
          type="button"
          className={`app-toggle${answer === "no" ? " active" : ""}`}
          onClick={() => onChange({ answer: "no", note: "" })}
        >
          No
        </button>
        <button
          type="button"
          className={`app-toggle${answer === "yes" ? " active" : ""}`}
          onClick={() => onChange({ answer: "yes", note })}
        >
          Yes
        </button>
      </div>
      {answer === "yes" && (
        <label className="app-followup-label">
          <span className="app-field-sublabel">{followupLabel}</span>
          <textarea
            value={note}
            onChange={(e) => onChange({ answer: "yes", note: e.target.value })}
            className="app-field-textarea"
            rows={3}
            placeholder="Optional"
          />
        </label>
      )}
    </div>
  );
}
