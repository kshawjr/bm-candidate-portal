import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase-auth";
import { createCoreClient } from "@/lib/core-client";
import { BrandSelector, type AdminBrand } from "@/components/admin/brand-selector";

export const dynamic = "force-dynamic";

interface Props {
  searchParams?: { brand?: string };
}

export default async function AdminDashboard({ searchParams }: Props) {
  // Middleware already gated this route, but belt-and-suspenders: re-check
  // here so server component state is never "user-less".
  const user = await getAdminUser();
  if (!user) {
    redirect("/admin/sign-in");
  }

  const core = createCoreClient();
  const { data: brandsRaw } = await core
    .from("brands")
    .select("id, slug, name")
    .order("name");
  const brands = (brandsRaw ?? []) as AdminBrand[];

  const requestedSlug = searchParams?.brand;
  const selectedSlug =
    (requestedSlug && brands.find((b) => b.slug === requestedSlug)?.slug) ??
    brands[0]?.slug ??
    "";

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "there";
  const firstName = displayName.split(" ")[0] || "there";

  return (
    <div className="admin-page">
      <h1 className="admin-h1">Welcome back, {firstName}</h1>
      <p className="admin-muted">
        Pick a brand, then pick what you want to edit.
      </p>

      <section className="admin-section">
        <div className="admin-section-label">Brand</div>
        <BrandSelector brands={brands} selectedSlug={selectedSlug} />
      </section>

      <section className="admin-placeholder-card">
        <div className="admin-placeholder-icon" aria-hidden="true">
          ✎
        </div>
        <h2 className="admin-placeholder-title">
          {selectedSlug ? "Edit content cards" : "Pick a brand to begin"}
        </h2>
        {selectedSlug && (
          <Link
            href={`/admin/content?brand=${selectedSlug}`}
            className="admin-brand-pill active"
            style={{ marginTop: 14, display: "inline-block" }}
          >
            Open editor →
          </Link>
        )}
      </section>
    </div>
  );
}
