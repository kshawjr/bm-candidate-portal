"use client";

import type { SelectOption } from "./fields";

export interface MotivationValue {
  /** All currently-selected chip values. Includes "other" if applicable. */
  selected: string[];
  /** Free-text shown only when "other" is in `selected`. */
  otherText: string;
}

interface Props {
  value: MotivationValue;
  onChange: (v: MotivationValue) => void;
  options: SelectOption[];
  otherValue?: string;
}

/**
 * Multi-select chip group for the motivation question. PR 37 changed this
 * from single-select to multi-select; chips toggle on and off independently.
 * "Other" toggles the free-text reveal below the grid like before.
 */
export function MotivationField({
  value,
  onChange,
  options,
  otherValue = "other",
}: Props) {
  const selected = value.selected;
  const isSelected = (v: string) => selected.includes(v);

  const toggle = (v: string) => {
    const isOther = v === otherValue;
    if (isSelected(v)) {
      // Removing: drop the chip; clear otherText if we're removing Other so
      // the textarea doesn't keep stale input around.
      const next = selected.filter((s) => s !== v);
      onChange({
        selected: next,
        otherText: isOther ? "" : value.otherText,
      });
    } else {
      onChange({
        selected: [...selected, v],
        otherText: value.otherText,
      });
    }
  };

  return (
    <div className="motivation-field">
      <div
        className="motivation-grid"
        role="group"
        aria-label="Motivation (select all that apply)"
      >
        {options.map((opt) => {
          const active = isSelected(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              className={`motivation-chip${active ? " selected" : ""}`}
              onClick={() => toggle(opt.value)}
            >
              <span className="motivation-chip-label">{opt.label}</span>
            </button>
          );
        })}
      </div>
      {isSelected(otherValue) && (
        <label className="app-followup-label">
          <span className="app-field-sublabel">What&apos;s the &quot;other&quot;?</span>
          <input
            type="text"
            value={value.otherText}
            onChange={(e) =>
              onChange({ ...value, otherText: e.target.value })
            }
            placeholder="Tell us more"
            className="app-field-input"
            autoFocus
          />
        </label>
      )}
    </div>
  );
}

/**
 * Build the contextual prompt for the motivation elaboration screen.
 * References the chips the candidate selected so the question feels
 * personal. Phrasing wraps the labels in quotes so capitalization in the
 * label set doesn't make the sentence read awkwardly.
 *
 * - Single selection: "What's most important to you about <selection>?"
 * - Multiple: "What's most important to you about <a> and <b>?" (or
 *   <a>, <b> and <c> for 3+).
 * - Other only: falls back to the generic "drawing you to this" prompt.
 */
export function motivationElaborationPrompt(
  value: MotivationValue,
  options: SelectOption[],
  otherValue = "other",
): string {
  const nonOther = value.selected.filter((s) => s !== otherValue);
  const labels = nonOther.map(
    (s) => options.find((o) => o.value === s)?.label ?? s,
  );
  if (labels.length === 0) {
    return "What's drawing you to this?";
  }
  // Quote the labels so capitalization doesn't trip the sentence flow.
  const quoted = labels.map((l) => `"${l}"`);
  let joined: string;
  if (quoted.length === 1) {
    joined = quoted[0];
  } else if (quoted.length === 2) {
    joined = `${quoted[0]} and ${quoted[1]}`;
  } else {
    joined = `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
  }
  return `What's most important to you about ${joined}?`;
}
