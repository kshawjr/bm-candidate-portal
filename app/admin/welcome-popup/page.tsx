import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase-auth";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import { WelcomePopupEditor } from "@/components/admin/welcome-popup-editor";
import {
  saveWelcomePopupAction,
  deleteWelcomePopupAction,
  uploadWelcomeVideoAction,
} from "./actions";
import type { VideoProvider } from "@/lib/video-source";

export const dynamic = "force-dynamic";

interface Props {
  searchParams?: { brand?: string };
}

export default async function WelcomePopupPage({ searchParams }: Props) {
  const user = await getAdminUser();
  if (!user) redirect("/admin/sign-in");

  const core = createCoreClient();
  const { data: brandsRaw } = await core
    .from("brands")
    .select("id, slug, name, colors, font_overrides, logo_url")
    .order("name");
  const brands = brandsRaw ?? [];

  if (brands.length === 0) {
    return (
      <div className="admin-page">
        <h1 className="admin-h1">Welcome popup</h1>
        <p className="admin-muted">
          No brands found in <code>bmave-core.brands</code>.
        </p>
      </div>
    );
  }

  const requestedSlug = searchParams?.brand;
  const brand = brands.find((b) => b.slug === requestedSlug) ?? brands[0]!;

  const app = createAppServiceClient();
  const { data: popupRow } = await app
    .from("welcome_popups")
    .select(
      "title, video_url, video_provider, description, cta_dismiss_label, is_active, updated_at",
    )
    .eq("brand_id", brand.id)
    .maybeSingle();

  const initial = popupRow
    ? {
        title: (popupRow.title as string | null) ?? null,
        videoUrl: (popupRow.video_url as string) ?? "",
        videoProvider: popupRow.video_provider as VideoProvider,
        description: (popupRow.description as string | null) ?? null,
        ctaDismissLabel:
          (popupRow.cta_dismiss_label as string | null) ?? "Got it",
        isActive: Boolean(popupRow.is_active),
        updatedAt: (popupRow.updated_at as string | null) ?? null,
      }
    : null;

  return (
    <WelcomePopupEditor
      brandId={brand.id}
      brandSlug={brand.slug}
      brandName={brand.name}
      initial={initial}
      onSave={saveWelcomePopupAction}
      onDelete={deleteWelcomePopupAction}
      onUploadVideo={uploadWelcomeVideoAction}
    />
  );
}
