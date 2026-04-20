import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Paths under /admin that don't require an authenticated session. Everything
// else under /admin is gated: unauthenticated -> /admin/sign-in; authenticated
// but non-@bmave.com -> /admin/access-denied.
const PUBLIC_ADMIN_PATHS = ["/admin/sign-in", "/admin/sign-out", "/admin/access-denied"];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

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

  const path = request.nextUrl.pathname;
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

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
