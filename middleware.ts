import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getBrandFromHostname } from "@/lib/brand-from-hostname";

// Paths under /admin that don't require an authenticated session. Everything
// else under /admin is gated: unauthenticated -> /admin/sign-in; authenticated
// but non-@bmave.com -> /admin/access-denied.
const PUBLIC_ADMIN_PATHS = [
  "/admin/sign-in",
  "/admin/sign-out",
  "/admin/access-denied",
];

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
        `https://flightdeck.bmave.com${path}${request.nextUrl.search}`,
      );
    }
    if (cfg.type === "unknown") {
      // Defensive — should rarely happen since DNS won't route here, but
      // an unknown host hitting /admin shouldn't expose the admin UI.
      return NextResponse.redirect(
        `https://flightdeck.bmave.com${path}${request.nextUrl.search}`,
      );
    }
    // Admin host (or dev/preview): apply the existing auth gate.
    return await applyAdminAuth(request, response, path);
  }

  return response;
}

async function applyAdminAuth(
  request: NextRequest,
  response: NextResponse,
  path: string,
): Promise<NextResponse> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  // Refresh the session cookie on every /admin request.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isPublic = PUBLIC_ADMIN_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
  if (isPublic) return response;

  if (!session) {
    const signInUrl = new URL("/admin/sign-in", request.url);
    return NextResponse.redirect(signInUrl);
  }

  const email = (session.user.email ?? "").toLowerCase();
  if (!email.endsWith("@bmave.com")) {
    const deniedUrl = new URL("/admin/access-denied", request.url);
    return NextResponse.redirect(deniedUrl);
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
