// Tiny {placeholder} interpolation used by the call_prep content type.
// Safe on both server and client — no server-only imports.

export interface TemplateContext {
  call_type?: string | null;
  call_type_lower?: string | null;
  duration?: number | string | null;
  rep_name?: string | null;
  rep_first_name?: string | null;
  brand_name?: string | null;
  brand_short_name?: string | null;
  candidate_first_name?: string | null;
}

/**
 * Replace every `{key}` in `text` with the matching context value.
 * Unknown or empty keys are left as the literal `{key}` so admins see
 * the token in the editor preview and can fix typos.
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
 * Derive `rep_first_name`, `call_type_lower`, and a sensible
 * `brand_short_name` fallback from a sparser source context.
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
