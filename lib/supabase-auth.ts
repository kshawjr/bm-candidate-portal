// Server-side Supabase auth helpers for the admin UI.
//
// Auth lives on the bm-candidate-portal project (same project that owns the
// candidate session tables). This module wraps @supabase/ssr's cookie-backed
// Next 14 App Router client and adds a domain-gate helper that restricts
// admin access to @bmave.com emails.

import "server-only";
import { cookies } from "next/headers";
import { createServerClient as createSSRClient, type CookieOptions } from "@supabase/ssr";
import type { Session, User } from "@supabase/supabase-js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env var: ${name}`);
  }
  return v;
}

/**
 * Create a Supabase server client bound to the current request's cookies.
 * Use inside server components, route handlers, and middleware.
 */
export function createServerClient() {
  const cookieStore = cookies();
  return createSSRClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Setting cookies from a server component (vs. route handler /
            // middleware) throws — middleware handles session refresh in
            // practice, so swallow here.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Same as above.
          }
        },
      },
    },
  );
}

/** Returns the authenticated session, or null. */
export async function getSession(): Promise<Session | null> {
  const supabase = createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Returns the authenticated user if their email ends with @bmave.com, else
 * null. Use this in admin pages + middleware to gate access.
 */
export async function getAdminUser(): Promise<User | null> {
  const session = await getSession();
  const user = session?.user;
  if (!user) return null;
  const email = (user.email ?? "").toLowerCase();
  if (!email.endsWith("@bmave.com")) return null;
  return user;
}
