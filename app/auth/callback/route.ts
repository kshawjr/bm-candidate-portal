import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-auth";

// Supabase redirects here with `?code=<auth-code>` after a successful Google
// OAuth sign-in. Exchange the code for a session, then bounce to /admin.
// The domain gate at /admin + middleware will decide whether the signed-in
// email is allowed.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin";

  if (code) {
    const supabase = createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/admin/sign-in?error=auth_failed`);
}
