// Generic single-brace template resolver for admin-authored copy that
// gets candidate/rep/brand context interpolated at render time.
//
// Distinct from `applySlideTemplate` (components/content-types/slide-types.ts)
// which uses double-brace `{{first_name}}` syntax inherited from the
// slide editor. This module uses single-brace `{var}` to match the
// admin-facing template hint UX in newer editors (waiting, future
// call_prep).
//
// Behavior:
//   - Unknown vars are left as-is (e.g. "{not_a_var}" stays "{not_a_var}")
//     so admins can spot typos in the live preview rather than have them
//     silently disappear.
//   - Empty / null context values render as an empty string, not the
//     literal "null" / "undefined".
//   - Pure function, safe on server or client.

export interface TemplateContext {
  call_type?: string | null;
  duration?: string | null;
  rep_first_name?: string | null;
  brand_short_name?: string | null;
  candidate_first_name?: string | null;
  /** Long-form formatted date of the candidate's upcoming discovery
   *  call, e.g. "Tuesday, May 20". Empty string when no booking exists,
   *  so a "See you on {discovery_call_date}" string still renders
   *  gracefully ("See you on , Jamie") — admins should write copy that
   *  reads OK in both states or guard separately. */
  discovery_call_date?: string | null;
}

const TOKEN_RE = /\{([a-z_]+)\}/g;

export function resolveTemplate(
  content: string,
  context: TemplateContext,
): string {
  return content.replace(TOKEN_RE, (match, name: string) => {
    if (!(name in context)) return match;
    const value = (context as Record<string, string | null | undefined>)[name];
    return typeof value === "string" ? value : "";
  });
}

// Convenience list of supported var names for the admin editor hint UI.
// Keep in sync with TemplateContext's keys above.
export const TEMPLATE_VARS: ReadonlyArray<keyof TemplateContext> = [
  "call_type",
  "duration",
  "rep_first_name",
  "brand_short_name",
  "candidate_first_name",
  "discovery_call_date",
];
