// Shared brand slug → production portal hostname map, plus the URL
// builders that use it. Extracted from
// app/api/webhooks/zoho-lead-created/route.ts so the webhook and
// scripts/backfill-cq-link.ts build links from ONE source of truth.
//
// Deliberately has no "server-only" import and no Next.js imports so a
// plain `tsx` script can import it.
//
// Note: lib/brand-from-hostname.ts (used by middleware) and
// app/loading/page.tsx each still carry their own copy of these hosts.
// If a domain changes, update all three.

export const PORTAL_HOST_BY_BRAND_SLUG: Record<string, string> = {
  "hounds-town-usa": "houndstowndiscovery.bmave.com",
  "cruisin-tikis": "cruisintikisdiscovery.bmave.com",
};

/** Full portal link, e.g. https://houndstowndiscovery.bmave.com/portal/<token> */
export function buildPortalUrl(host: string, token: string): string {
  return `https://${host}/portal/${token}`;
}

/**
 * Short re-engagement link written to Zoho's CQ_Link field, e.g.
 * https://houndstowndiscovery.bmave.com/a/<token>. Clicking it logs the
 * reengaged_via_link milestone and redirects into the portal's
 * application step (see app/a/[token]/route.ts).
 */
export function buildCqShortLink(host: string, token: string): string {
  return `https://${host}/a/${token}`;
}
