"use client";

import type { SelectOption } from "./fields";

export interface MotivationValue {
  value: string;
  otherText: string;
}

interface Props {
  value: MotivationValue;
  onChange: (v: MotivationValue) => void;
  options: SelectOption[];
  otherValue?: string;
}

// Chip-style single-select rendered in a 2-column grid, with an "Other" reveal
// that shows a free-text input below the grid. Used for the motivation
// question to match the lighter feel of the financial chips — richer than a
// plain <select>, lighter than the full-width stacked-button SingleSelect.
export function MotivationField({
  value,
  onChange,
  options,
  otherValue = "other",
}: Props) {
  const selected = value.value;
  return (
    <div className="motivation-field">
      <div className="motivation-grid" role="radiogroup" aria-label="Motivation">
        {options.map((opt) => {
          const active = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={`motivation-chip${active ? " selected" : ""}`}
              onClick={() =>
                onChange({
                  value: opt.value,
                  otherText: opt.value === otherValue ? value.otherText : "",
                })
              }
            >
              <span className="motivation-chip-label">{opt.label}</span>
            </button>
          );
        })}
      </div>
      {selected === otherValue && (
        <label className="app-followup-label">
          <span className="app-field-sublabel">Tell us more</span>
          <input
            type="text"
            value={value.otherText}
            onChange={(e) =>
              onChange({ value: otherValue, otherText: e.target.value })
            }
            placeholder="What's drawing you in?"
            className="app-field-input"
            autoFocus
          />
        </label>
      )}
    </div>
  );
}
