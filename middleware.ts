import { NextResponse, type NextRequest } from "next/server";
import { getBrandFromHostname } from "@/lib/brand-from-hostname";

export async function middleware(request: NextRequest) {
  const hostname = (request.headers.get("host") ?? "").toLowerCase();
  const cfg = getBrandFromHostname(hostname);
  const path = request.nextUrl.pathname;

  // PR 46: enrich every downstream request with hostname + brand info so
  // server components can branch without re-parsing the host. Cleared on
  // the response object so client code can't see them.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-hostname", hostname);
  requestHeaders.set("x-brand-type", cfg.type);
  if (cfg.type === "portal") {
    requestHeaders.set("x-brand-slug", cfg.brandSlug);
    requestHeaders.set("x-brand-id", cfg.brandId);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // /admin is admin-host-only. Brand portal subdomains shouldn't ever
  // serve the admin UI even if someone guesses the path; bounce them to
  // the canonical admin domain.
  if (path === "/admin" || path.startsWith("/admin/")) {
    if (cfg.type === "portal") {
      return NextResponse.redirect(
        `https://cpflightdeck.bmave.com${path}${request.nextUrl.search}`,
      );
    }
    if (cfg.type === "unknown") {
      // Defensive — should rarely happen since DNS won't route here, but
      // an unknown host hitting /admin shouldn't expose the admin UI.
      return NextResponse.redirect(
        `https://cpflightdeck.bmave.com${path}${request.nextUrl.search}`,
      );
    }
    // PR 47 (TEMPORARY): admin user-level auth gate is OFF. The
    // Supabase session check + @bmave.com domain check + redirects to
    // /admin/sign-in / /admin/access-denied previously lived here.
    // They were causing redirect loops with flightdeck.bmave.com's
    // Supabase Auth and blocking the team from using the admin at all.
    //
    // Trust model is now: anyone with the cpflightdeck.bmave.com URL
    // can access /admin. Keep that URL internal-only.
    //
    // See TODO_AUTH.md for restoration options. The git history of this
    // file (PR 46 / commit 5006194 and earlier) has the original
    // applyAdminAuth + createServerClient implementation if you need
    // to copy it back.
    return response;
  }

  return response;
}

// PR 46: matcher widened from /admin only → almost everything so the
// hostname headers get attached to /portal and / requests too. Excludes
// Next's static asset paths (no point processing them) and OAuth
// callback / API routes (which have their own handling).
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|auth/callback).*)",
  ],
};
