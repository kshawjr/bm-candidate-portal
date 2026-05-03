// PR 51: ParseID is a custom field on Zoho Leads that the Gravity Form
// stamps with a brand identifier (the WP site each form lives on knows
// which brand it belongs to). The Zoho lead-created webhook sends
// ParseID in its payload; this maps it back to the bmave-core brand_id
// + slug so the webhook receiver can write the new candidate against
// the right brand.
//
// Brand IDs match lib/brand-from-hostname.ts — keep these in sync. If a
// third brand comes online, add it in both places.
const BRAND_BY_PARSEID: Record<string, { brandSlug: string; brandId: string }> = {
  houndstown: {
    brandSlug: "hounds-town-usa",
    brandId: "feb1fc5a-6839-41c0-8d3d-7f3deb0a1b83",
  },
  tourscale: {
    brandSlug: "cruisin-tikis",
    brandId: "af772a65-c5f4-4a6c-a140-e1ecb715b2ae",
  },
};

export function getBrandFromParseId(
  parseId: string | null | undefined,
): { brandSlug: string; brandId: string } | null {
  const normalized = (parseId ?? "").toLowerCase().trim();
  if (!normalized) return null;
  return BRAND_BY_PARSEID[normalized] ?? null;
}
