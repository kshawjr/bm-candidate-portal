import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase-auth";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import { StructureEditor } from "@/components/admin/structure-editor";
import type { AdminStopRow } from "@/components/admin/structure-editor";
import {
  archiveStopAction,
  createStopAction,
  deleteStopAction,
  reorderStopsAction,
  updateStopAction,
} from "./actions";

export const dynamic = "force-dynamic";

interface Props {
  searchParams?: { brand?: string };
}

export default async function StructurePage({ searchParams }: Props) {
  const user = await getAdminUser();
  if (!user) redirect("/admin/sign-in");

  const core = createCoreClient();
  const { data: brandsRaw } = await core
    .from("brands")
    .select("id, slug, name")
    .order("name");
  const brands = brandsRaw ?? [];

  if (brands.length === 0) {
    return (
      <div className="admin-page">
        <h1 className="admin-h1">Structure</h1>
        <p className="admin-muted">
          No brands found in <code>bmave-core.brands</code>.
        </p>
      </div>
    );
  }

  const requestedSlug = searchParams?.brand;
  const brand =
    brands.find((b) => b.slug === requestedSlug) ?? brands[0]!;

  const app = createAppServiceClient();
  const [{ data: stopRows }, { data: stepRows }] = await Promise.all([
    app
      .from("stops_config")
      .select(
        "id, stop_key, position, label, name, icon, description, is_archived",
      )
      .eq("brand_id", brand.id)
      .order("position"),
    app
      .from("steps_config")
      .select("id, stop_key, is_archived")
      .eq("brand_id", brand.id),
  ]);

  const stepCounts: Record<string, { total: number; active: number }> = {};
  for (const row of stepRows ?? []) {
    const bucket = (stepCounts[row.stop_key] ??= { total: 0, active: 0 });
    bucket.total += 1;
    if (!row.is_archived) bucket.active += 1;
  }

  const stops: AdminStopRow[] = (stopRows ?? []).map((s) => ({
    id: s.id,
    stop_key: s.stop_key,
    position: s.position,
    label: s.label,
    name: s.name,
    icon: (s.icon as string | null) ?? null,
    description: (s.description as string | null) ?? null,
    is_archived: !!s.is_archived,
    step_count: stepCounts[s.stop_key]?.active ?? 0,
    step_count_total: stepCounts[s.stop_key]?.total ?? 0,
  }));

  return (
    <StructureEditor
      brandId={brand.id}
      brandSlug={brand.slug}
      brandName={brand.name}
      stops={stops}
      createStop={createStopAction}
      updateStop={updateStopAction}
      deleteStop={deleteStopAction}
      archiveStop={archiveStopAction}
      reorderStops={reorderStopsAction}
    />
  );
}
