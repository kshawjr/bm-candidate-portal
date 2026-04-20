import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase-auth";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import {
  ContentEditor,
  type AdminStep,
  type AdminStop,
} from "@/components/admin/content-editor";
import type { ContentCard } from "@/components/content-cards/types";
import {
  saveContentCardAction,
  deleteContentCardAction,
  uploadCardImageAction,
} from "./actions";

export const dynamic = "force-dynamic";

interface Props {
  searchParams?: { brand?: string; step?: string };
}

// Hardcoded preview tokens per brand. Matches the dev tokens seeded in
// scripts/seed.ts. When more brands ship, swap to a candidates_in_portal
// query for the most recent test token.
const PREVIEW_TOKEN: Record<string, string> = {
  "hounds-town-usa": "test-token-123",
  "cruisin-tikis": "test-token-456",
};

export default async function ContentEditorPage({ searchParams }: Props) {
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
        <h1 className="admin-h1">Content</h1>
        <p className="admin-muted">
          No brands found in <code>bmave-core.brands</code>. Seed at least one
          brand before using the editor.
        </p>
      </div>
    );
  }

  const requestedSlug = searchParams?.brand;
  const brand =
    brands.find((b) => b.slug === requestedSlug) ?? brands[0]!;

  // Fetch this brand's stops + steps from bm-candidate-portal.
  const app = createAppServiceClient();
  const [{ data: stopsRows }, { data: stepsRows }] = await Promise.all([
    app
      .from("stops_config")
      .select("stop_key, position, label, name")
      .eq("brand_id", brand.id)
      .order("position"),
    app
      .from("steps_config")
      .select(
        "id, stop_key, position, step_key, label, description, content_type, content_cards",
      )
      .eq("brand_id", brand.id)
      .order("stop_key")
      .order("position"),
  ]);

  const stops: AdminStop[] = (stopsRows ?? []).map((s) => ({
    stop_key: s.stop_key,
    position: s.position,
    label: s.label,
    name: s.name,
  }));

  const stepsByStop: Record<string, AdminStep[]> = {};
  for (const row of stepsRows ?? []) {
    const step: AdminStep = {
      id: row.id,
      stop_key: row.stop_key,
      step_key: row.step_key,
      position: row.position,
      label: row.label,
      description: row.description,
      content_type: row.content_type,
      content_cards: Array.isArray(row.content_cards)
        ? (row.content_cards as ContentCard[])
        : [],
    };
    (stepsByStop[row.stop_key] ??= []).push(step);
  }
  for (const k of Object.keys(stepsByStop)) {
    stepsByStop[k].sort((a, b) => a.position - b.position);
  }

  const requestedStepId = searchParams?.step ?? null;
  const allStepIds = new Set(
    Object.values(stepsByStop).flatMap((arr) => arr.map((s) => s.id)),
  );
  const initialStepId =
    requestedStepId && allStepIds.has(requestedStepId)
      ? requestedStepId
      : null;

  return (
    <ContentEditor
      brandSlug={brand.slug}
      brandName={brand.name}
      stops={stops}
      stepsByStop={stepsByStop}
      initialStepId={initialStepId}
      saveCard={saveContentCardAction}
      deleteCard={deleteContentCardAction}
      upload={uploadCardImageAction}
      candidateTokenForPreview={PREVIEW_TOKEN[brand.slug] ?? null}
    />
  );
}
