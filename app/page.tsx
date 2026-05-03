import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getBrandFromHostname,
  getBrandMarketingUrl,
} from "@/lib/brand-from-hostname";

export const dynamic = "force-dynamic";

/**
 * PR 46: hostname-aware root.
 *
 *   houndstowndiscovery.bmave.com  → hounds-town-usa.com
 *   cruisintikisdiscovery.bmave.com → cruisintikis.com
 *   flightdeck.bmave.com            → /admin
 *   localhost / vercel.app preview  → /admin (dev convenience)
 *   anything else                   → bmave.com
 *
 * Brand portals are token-only; landing on a brand subdomain without a
 * token is almost always a confused candidate or curious browser, not a
 * real entry point — bouncing them to the brand site is friendlier than
 * showing a 404.
 */
export default function HomePage() {
  const headersList = headers();
  const hostname = headersList.get("host") ?? "";
  const cfg = getBrandFromHostname(hostname);

  if (cfg.type === "portal") {
    const url = getBrandMarketingUrl(cfg.brandSlug);
    redirect(url ?? "https://bmave.com");
  }

  if (cfg.type === "admin") {
    redirect("/admin");
  }

  // Unknown hostname — don't expose anything.
  redirect("https://bmave.com");
}
