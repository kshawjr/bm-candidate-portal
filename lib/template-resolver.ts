// Tiny {placeholder} interpolation used by the call_prep content type.
// Safe on both server and client — no server-only imports.

export interface TemplateContext {
  /** Event label from the linked schedule step, as stored (e.g.
   * "Discovery Call"). */
  call_type?: string | null;
  /** Lowercase variant for mid-sentence use. */
  call_type_lower?: string | null;
  /** Minutes from the linked schedule step. */
  duration?: number | string | null;
  /** Full rep name. */
  rep_name?: string | null;
  /** First whitespace-delimited token of rep_name. */
  rep_first_name?: string | null;
  /** Full brand name as stored. */
  brand_name?: string | null;
  /** Conversational short name (e.g. "Hounds Town"). Falls back to
   * brand_name in the editor context if short_name is empty. */
  brand_short_name?: string | null;
  candidate_first_name?: string | null;
}

/**
 * Replace every `{key}` in `text` with the matching context value.
 * - Unknown keys stay as the literal `{key}` (helpful signal to the admin
 *   that they typo'd a placeholder).
 * - Null/undefined/empty values also leave the literal `{key}` in place so
 *   preview copy doesn't suddenly drop words at runtime.
 */
export function resolveTemplate(
  text: string,
  ctx: TemplateContext,
): string {
  if (!text) return text;
  return text.replace(/\{([a-z_]+)\}/g, (match, key) => {
    const val = (ctx as Record<string, unknown>)[key];
    if (val === undefined || val === null) return match;
    const str = String(val);
    if (str.length === 0) return match;
    return str;
  });
}

/**
 * Convenience: derive `rep_first_name`, `call_type_lower`, and defaults
 * from a sparser source context. Keeps call sites from repeating the
 * token-split / case-downing logic.
 */
export function buildTemplateContext(input: {
  callType?: string | null;
  durationMinutes?: number | null;
  repName?: string | null;
  brandName?: string | null;
  brandShortName?: string | null;
  candidateFirstName?: string | null;
}): TemplateContext {
  const repName = input.repName?.trim() ?? null;
  const repFirst = repName ? repName.split(/\s+/)[0] : null;
  const callType = input.callType?.trim() ?? null;
  return {
    call_type: callType,
    call_type_lower: callType ? callType.toLowerCase() : null,
    duration:
      typeof input.durationMinutes === "number"
        ? input.durationMinutes
        : null,
    rep_name: repName,
    rep_first_name: repFirst,
    brand_name: input.brandName?.trim() || null,
    brand_short_name:
      (input.brandShortName?.trim() ||
        input.brandName?.trim() ||
        null) ?? null,
    candidate_first_name: input.candidateFirstName?.trim() || null,
  };
}
