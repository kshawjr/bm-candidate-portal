// Shared opt-out enum. Lives outside the "use server" actions module
// because Next.js server-action files can only export async functions —
// a const array export throws "A 'use server' file can only export
// async functions" at build time.

export const OPT_OUT_REASONS = [
  "Too expensive",
  "Timing not right",
  "Not the right fit",
  "Other",
] as const;

export type OptOutReason = (typeof OPT_OUT_REASONS)[number];
