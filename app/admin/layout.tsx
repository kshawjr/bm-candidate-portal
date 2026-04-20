import Link from "next/link";
import { getAdminUser } from "@/lib/supabase-auth";
import "./admin.css";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAdminUser();

  // Sign-in + access-denied + any other unauthed admin view skips the chrome
  // and renders on a neutral background.
  if (!user) {
    return <div className="admin-bare">{children}</div>;
  }

  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "Admin";
  const firstInitial = (name.trim().charAt(0) || "?").toUpperCase();

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-title">Blue Maven Admin</div>
        <div className="admin-topbar-user">
          <div className="admin-avatar" aria-hidden="true">
            {firstInitial}
          </div>
          <div className="admin-topbar-name">{name}</div>
          <Link href="/admin/sign-out" className="admin-topbar-signout">
            Sign out
          </Link>
        </div>
      </header>
      <div className="admin-body">
        <aside className="admin-sidenav">
          <Link href="/admin" className="admin-navlink admin-navlink-active">
            Content
          </Link>
          <span className="admin-navlink admin-navlink-disabled">
            Candidates <small>Coming soon</small>
          </span>
          <span className="admin-navlink admin-navlink-disabled">
            Settings <small>Coming soon</small>
          </span>
        </aside>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
