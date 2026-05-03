// PR 46: hostname → brand mapping for the multi-domain deployment.
//
// Production domains:
//   houndstowndiscovery.bmave.com  → Hounds Town candidate portal
//   cruisintikisdiscovery.bmave.com → Cruisin' Tikis candidate portal
//   cpflightdeck.bmave.com           → admin (cross-brand management)
//
// Anything not in the table is treated as either:
//   - admin (localhost / Vercel preview URLs — useful for QA + dev)
//   - unknown (everything else — root page sends them to bmave.com)
//
// Brand IDs come from bmave-core.brands. Verify before changing.

export type HostnameConfig =
  | { type: "portal"; brandSlug: string; brandId: string }
  | { type: "admin" }
  | { type: "unknown" };

const PORTAL_HOSTS: Record<string, { brandSlug: string; brandId: string }> = {
  "houndstowndiscovery.bmave.com": {
    brandSlug: "hounds-town-usa",
    brandId: "feb1fc5a-6839-41c0-8d3d-7f3deb0a1b83",
  },
  "cruisintikisdiscovery.bmave.com": {
    brandSlug: "cruisin-tikis",
    brandId: "af772a65-c5f4-4a6c-a140-e1ecb715b2ae",
  },
};

const ADMIN_HOSTS = new Set<string>(["cpflightdeck.bmave.com"]);

/**
 * Best-effort treat localhost + Vercel previews as admin so dev and QA
 * environments aren't crippled by the production-only domain table.
 * Production traffic to a real bmave.com brand subdomain hits the
 * explicit map above before this fallback fires.
 */
function isDevOrPreviewHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h.startsWith("localhost") || h.startsWith("127.0.0.1")) return true;
  if (h.endsWith(".vercel.app")) return true;
  return false;
}

export function getBrandFromHostname(hostname: string): HostnameConfig {
  // Strip a port if present (host header includes it for non-standard ports).
  const lower = hostname.toLowerCase();
  const portal = PORTAL_HOSTS[lower];
  if (portal) {
    return { type: "portal", ...portal };
  }
  if (ADMIN_HOSTS.has(lower)) {
    return { type: "admin" };
  }
  if (isDevOrPreviewHost(lower)) {
    return { type: "admin" };
  }
  return { type: "unknown" };
}

export function isBrandPortalHost(hostname: string): boolean {
  return getBrandFromHostname(hostname).type === "portal";
}

export function isAdminHost(hostname: string): boolean {
  return getBrandFromHostname(hostname).type === "admin";
}

/**
 * Build the canonical portal URL for a candidate on the production domain
 * that matches their brand. Used by /portal/[token] to redirect when a
 * candidate visits the wrong brand subdomain.
 *
 * Falls back to cpflightdeck.bmave.com for unknown brands so admins can
 * still preview the candidate.
 */
export function getCorrectPortalUrl(
  token: string,
  brandSlug: string,
): string {
  for (const [host, cfg] of Object.entries(PORTAL_HOSTS)) {
    if (cfg.brandSlug === brandSlug) {
      return `https://${host}/portal/${token}`;
    }
  }
  return `https://cpflightdeck.bmave.com/portal/${token}`;
}

/**
 * The brand's marketing website — sent to the home page when someone
 * lands on a brand subdomain without a token. Hardcoded; admins can edit
 * here when domains change.
 */
export function getBrandMarketingUrl(brandSlug: string): string | null {
  if (brandSlug === "hounds-town-usa") return "https://hounds-town-usa.com";
  if (brandSlug === "cruisin-tikis") return "https://cruisintikis.com";
  return null;
}
