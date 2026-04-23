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
