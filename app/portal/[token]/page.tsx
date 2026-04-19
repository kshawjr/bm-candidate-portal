import { notFound } from "next/navigation";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import {
  CinematicShell,
  type Stop,
  type Step,
  type ContentType,
  type BrandColors,
} from "@/components/cinematic-shell";

export const dynamic = "force-dynamic";

interface PortalContentRow {
  content_key: string;
  body: string | null;
  data: unknown;
}

function pickText(rows: PortalContentRow[], key: string, fallback = ""): string {
  return rows.find((r) => r.content_key === key)?.body ?? fallback;
}

export default async function PortalTokenPage({
  params,
}: {
  params: { token: string };
}) {
  const app = createAppServiceClient();
  const { data: session } = await app
    .from("candidates_in_portal")
    .select("id, candidate_id, current_stop, current_step")
    .eq("token", params.token)
    .maybeSingle();
  if (!session) notFound();

  const core = createCoreClient();
  const { data: candidate } = await core
    .from("candidates")
    .select("first_name, brand_id")
    .eq("id", session.candidate_id)
    .maybeSingle();
  if (!candidate) notFound();

  const { data: brand } = await core
    .from("brands")
    .select("id, slug, name, parent_brand, tagline, colors")
    .eq("id", candidate.brand_id)
    .maybeSingle();
  if (!brand) notFound();

  const [{ data: portalContent }, { data: stopsRows }, { data: stepsRows }] =
    await Promise.all([
      core
        .from("portal_content")
        .select("content_key, body, data")
        .eq("brand_id", brand.id),
      app
        .from("stops_config")
        .select("stop_key, position, label, name, icon")
        .eq("brand_id", brand.id)
        .order("position"),
      app
        .from("steps_config")
        .select("stop_key, position, step_key, label, description, content_type, config")
        .eq("brand_id", brand.id)
        .order("stop_key")
        .order("position"),
    ]);

  if (!stopsRows?.length) {
    throw new Error(
      `No stops_config rows for brand ${brand.slug}. Run 'npm run seed'.`,
    );
  }

  const content = (portalContent ?? []) as PortalContentRow[];
  const brandMarkHtml = pickText(content, "brand_mark_html", brand.name);
  const leader = {
    name: pickText(content, "leader_name", "Your franchise growth leader"),
    role: pickText(content, "leader_role", ""),
    email: pickText(content, "leader_email", ""),
  };

  const stops: Stop[] = stopsRows.map((s) => ({
    stop_key: s.stop_key,
    position: s.position,
    label: s.label,
    name: s.name,
    icon: s.icon,
  }));

  const stepsByStop: Record<string, Step[]> = {};
  for (const row of stepsRows ?? []) {
    const step: Step = {
      step_key: row.step_key,
      stop_key: row.stop_key,
      position: row.position,
      label: row.label,
      description: row.description,
      content_type: row.content_type as ContentType,
      config: (row.config ?? {}) as Record<string, unknown>,
    };
    (stepsByStop[row.stop_key] ??= []).push(step);
  }
  for (const key of Object.keys(stepsByStop)) {
    stepsByStop[key].sort((a, b) => a.position - b.position);
  }

  const colors = brand.colors as BrandColors;
  const currentStopIdx = Math.min(session.current_stop ?? 0, stops.length - 1);
  const initialStopIdx = currentStopIdx;
  const initialStepIdx = Math.max(0, session.current_step ?? 0);

  return (
    <main className="portal-page">
      <CinematicShell
        brandName={brand.name}
        brandMarkHtml={brandMarkHtml}
        parentBrand={brand.parent_brand}
        colors={colors}
        leader={leader}
        stops={stops}
        stepsByStop={stepsByStop}
        currentStopIdx={currentStopIdx}
        initialStopIdx={initialStopIdx}
        initialStepIdx={initialStepIdx}
      />
    </main>
  );
}
