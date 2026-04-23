import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

interface Props {
  searchParams?: { brand?: string };
}

// The dashboard used to host a pill-based BrandSelector (PR 12a). Now that
// the top-bar AdminBrandSwitcher lives in the admin layout and persists
// across every admin page, a second brand selector on this landing page is
// redundant. Decision: drop the pills, keep this page as a short welcome +
// CTA that bounces the user into the content editor with whatever brand the
// switcher has currently selected (or the first brand if nothing's picked).
export default async function AdminDashboard({ searchParams }: Props) {
  const user = await getAdminUser();
  if (!user) redirect("/admin/sign-in");

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "there";
  const firstName = displayName.split(" ")[0] || "there";

  const brandParam = searchParams?.brand;
  const editorHref = brandParam
    ? `/admin/content?brand=${encodeURIComponent(brandParam)}`
    : "/admin/content";

  return (
    <div className="admin-page">
      <h1 className="admin-h1">Welcome back, {firstName}</h1>
      <p className="admin-muted">
        Pick a brand in the top bar, then jump into the editor.
      </p>

      <section className="admin-placeholder-card">
        <div className="admin-placeholder-icon" aria-hidden="true">
          ✎
        </div>
        <h2 className="admin-placeholder-title">Edit content cards</h2>
        <p className="admin-muted">
          Browse each chapter + step for the selected brand and update the cards
          that show up in the candidate portal.
        </p>
        <Link href={editorHref} className="admin-open-editor">
          Open editor →
        </Link>
      </section>
    </div>
  );
}
