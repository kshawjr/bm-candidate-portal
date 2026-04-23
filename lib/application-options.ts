// Source-of-truth option lists for the light application's enum-style fields.
// Used by both the renderer (client) and the admin display (server).

export interface ApplicationOption {
  value: string;
  label: string;
}

export const LIQUID_CAPITAL_RANGES: ApplicationOption[] = [
  { value: "0_50k",     label: "$0 – $50K" },
  { value: "50_100k",   label: "$50K – $100K" },
  { value: "100_200k",  label: "$100K – $200K" },
  { value: "200k_plus", label: "$200K+" },
];

export const NET_WORTH_RANGES: ApplicationOption[] = [
  { value: "0_250k",    label: "$0 – $250K" },
  { value: "250_500k",  label: "$250K – $500K" },
  { value: "500_850k",  label: "$500K – $850K" },
  { value: "850k_plus", label: "$850K+" },
];

export const CREDIT_SCORE_RANGES: ApplicationOption[] = [
  { value: "under_700", label: "Under 700" },
  { value: "700_750",   label: "700 – 750" },
  { value: "750_plus",  label: "750+" },
];

// Humanize a stored value against a current option list. Falls back to a
// "(legacy)" suffix for historical values from older bucket schemes so admin
// rows render gracefully instead of showing the raw enum.
export function humanizeOption(
  value: string | null | undefined,
  options: ApplicationOption[],
): string {
  if (!value) return "—";
  const match = options.find((o) => o.value === value);
  if (match) return match.label;
  return `${value} (legacy)`;
}
