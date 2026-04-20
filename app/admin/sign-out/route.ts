import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-auth";

// Hit via GET from a nav link or access-denied page's sign-out button.
// Clears the session cookie and bounces back to the sign-in page.
export async function GET(request: Request) {
  const supabase = createServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/admin/sign-in", request.url));
}
