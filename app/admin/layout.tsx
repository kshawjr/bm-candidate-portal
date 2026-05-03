import { createCoreClient } from "@/lib/core-client";
import {
  AdminBrandSwitcher,
  type AdminSwitcherBrand,
} from "@/components/admin/brand-switcher";
import { AdminNav } from "@/components/admin/admin-nav";
import "./admin.css";

// PR 47: removing the auth check above also removed the cookie reads
// that made every /admin route dynamic. /admin/sign-in (useSearchParams)
// and /admin/access-denied (getSession) now fail static prerender. Mark
// the whole /admin segment dynamic so behavior matches the old auth-on
// build.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // PR 47 (TEMPORARY): admin auth gate is disabled. The previous flow
  // checked getAdminUser() and rendered a bare layout for unauthed
  // requests so the sign-in / access-denied views had their own chrome.
  // With auth off there's no user to gate on, so always render the
  // chrome. The persistent banner below makes the disabled state
  // unmissable. See TODO_AUTH.md for re-enable instructions.

  // Fetch brands once at the layout level so the top-bar switcher is
  // populated on every admin page. The current selection comes from
  // ?brand=… and is resolved inside the switcher (client).
  const core = createCoreClient();
  const { data: brandsRaw } = await core
    .from("brands")
    .select("id, slug, name, logo_url")
    .order("name");
  const brands: AdminSwitcherBrand[] = (brandsRaw ?? []).map((b) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    logo_url: (b.logo_url as string | null) ?? null,
  }));

  return (
    <div className="admin-shell">
      <div className="admin-auth-banner" role="status">
        ⚠️ Admin auth temporarily disabled — treat this URL as
        internal-only.
      </div>
      <header className="admin-topbar">
        <div className="admin-topbar-left">
          <div className="admin-topbar-title">Blue Maven Admin</div>
          <AdminBrandSwitcher brands={brands} />
        </div>
        <div className="admin-topbar-user">
          <div className="admin-avatar" aria-hidden="true">
            ⚠
          </div>
          <div className="admin-topbar-name">Auth off</div>
        </div>
      </header>
      <div className="admin-body">
        <aside className="admin-sidenav">
          <AdminNav />
        </aside>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
