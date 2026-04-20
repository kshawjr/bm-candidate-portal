import Link from "next/link";
import { getSession } from "@/lib/supabase-auth";

export default async function AccessDeniedPage() {
  const session = await getSession();
  const email = session?.user?.email ?? "";

  return (
    <div className="admin-auth-card">
      <h1 className="admin-auth-title">Access denied</h1>
      <p className="admin-auth-sub">
        The Blue Maven admin is restricted to <code>@bmave.com</code> accounts.
        {email && (
          <>
            {" "}
            You&apos;re signed in as <strong>{email}</strong>.
          </>
        )}
      </p>
      <Link href="/admin/sign-out" className="admin-auth-btn">
        Sign out and try again
      </Link>
    </div>
  );
}
