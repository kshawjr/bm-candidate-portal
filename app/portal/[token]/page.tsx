import { notFound } from "next/navigation";
import { Baloo_2, Nunito_Sans, Montserrat } from "next/font/google";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import {
  CinematicShell,
  type Stop,
  type Step,
  type ContentType,
  type BrandColors,
  type BrandTypography,
} from "@/components/cinematic-shell";
import {
  completeTourAction,
  saveApplicationAnswerAction,
  submitApplicationAction,
} from "./actions";
import { resolveJourneyCardState } from "@/components/sidebar/journey-card";

export const dynamic = "force-dynamic";

// Real per-brand display + body fonts.
// Hounds Town: Baloo 2 (heading, chunky rounded) + Nunito Sans (body).
// Cruisin' Tikis: Montserrat (heading + body, geometric sans).
const baloo2 = Baloo_2({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-baloo-2",
  display: "swap",
});
const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-nunito-sans",
  display: "swap",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

// Maps brand.font_overrides family names to the CSS vars registered above.
// Unknown names fall back to Inter (loaded in the root layout).
const FONT_VAR: Record<string, string> = {
  "Baloo 2": "var(--font-baloo-2)",
  "Nunito Sans": "var(--font-nunito-sans)",
  Montserrat: "var(--font-montserrat)",
  Inter: "var(--font-inter)",
};

interface PortalContentRow {
  content_key: string;
  body: string | null;
  data: unknown;
}

interface FontOverrides {
  heading_font?: string;
  heading_weight?: string;
  body_font?: string;
  heading_transform?: string;
}

interface BrandColorsWithPalette extends BrandColors {
  palette?: Record<string, string>;
}

function pickText(rows: PortalContentRow[], key: string, fallback = ""): string {
  return rows.find((r) => r.content_key === key)?.body ?? fallback;
}

function resolveTypography(overrides: FontOverrides | null | undefined): BrandTypography {
  const o = overrides ?? {};
  return {
    headingFontVar: FONT_VAR[o.heading_font ?? ""] ?? "var(--font-inter)",
    bodyFontVar: FONT_VAR[o.body_font ?? ""] ?? "var(--font-inter)",
    headingWeight: o.heading_weight ?? "600",
    headingTransform: o.heading_transform === "uppercase" ? "uppercase" : "none",
  };
}

export default async function PortalTokenPage({
  params,
}: {
  params: { token: string };
}) {
  const app = createAppServiceClient();
  const { data: session } = await app
    .from("candidates_in_portal")
    .select(
      "id, candidate_id, current_stop, current_step, is_app_submitted, last_activity_at",
    )
    .eq("token", params.token)
    .maybeSingle();
  if (!session) notFound();

  const core = createCoreClient();
  const { data: candidate } = await core
    .from("candidates")
    .select("first_name, last_name, email, phone, brand_id")
    .eq("id", session.candidate_id)
    .maybeSingle();
  if (!candidate) notFound();

  const { data: brand } = await core
    .from("brands")
    .select(
      "id, slug, name, tagline, colors, font_overrides, logo_url",
    )
    .eq("id", candidate.brand_id)
    .maybeSingle();
  if (!brand) notFound();

  const [
    { data: portalContent },
    { data: stopsRows },
    { data: stepsRows },
    { data: applicationRows },
    { data: progressRows },
  ] = await Promise.all([
    core
      .from("portal_content")
      .select("content_key, body, data")
      .eq("brand_id", brand.id),
    app
      .from("stops_config")
      .select("stop_key, position, label, name, icon")
      .eq("brand_id", brand.id)
      .eq("is_archived", false)
      .order("position"),
    app
      .from("steps_config")
      .select(
        "stop_key, position, step_key, label, description, content_type, config, content_cards",
      )
      .eq("brand_id", brand.id)
      .eq("is_archived", false)
      .order("stop_key")
      .order("position"),
    app
      .from("application_responses")
      .select("field_key, field_value")
      .eq("candidate_in_portal_id", session.id),
    app
      .from("candidate_progress")
      .select("stop_key, step_key, completed_at")
      .eq("candidate_in_portal_id", session.id),
  ]);

  if (!stopsRows?.length) {
    // Brand has no active stops — either freshly seeded with nothing yet, or
    // every stop has been archived in the admin. Render a friendly holding
    // page instead of crashing; admin can set up the structure and the
    // candidate can come back.
    return (
      <main className="portal-empty">
        <div className="portal-empty-card">
          <h1>Welcome to {brand.name}</h1>
          <p>
            This portal is still being set up. Check back soon — your
            franchise development team is finalizing the journey.
          </p>
        </div>
      </main>
    );
  }

  const content = (portalContent ?? []) as PortalContentRow[];
  const brandMarkHtml = pickText(content, "brand_mark_html", brand.name);
  const leader = {
    name: pickText(content, "leader_name", "Your franchise growth leader"),
    role: pickText(content, "leader_role", ""),
    email: pickText(content, "leader_email", ""),
  };

  // Stop 1 hero strip — 4 stats. Empty num drops the row.
  const heroStats = [1, 2, 3, 4]
    .map((n) => ({
      num: pickText(content, `hero_stat_${n}_num`),
      label: pickText(content, `hero_stat_${n}_label`),
    }))
    .filter((s) => s.num.length > 0);
  const heroStripHeading = pickText(
    content,
    "hero_strip_heading",
    `${brand.name} by the numbers`,
  );

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
      content_cards: Array.isArray(row.content_cards) ? row.content_cards : [],
    };
    (stepsByStop[row.stop_key] ??= []).push(step);
  }
  for (const key of Object.keys(stepsByStop)) {
    stepsByStop[key].sort((a, b) => a.position - b.position);
  }

  const colors = brand.colors as BrandColorsWithPalette;
  const palette = colors.palette ?? {};
  const typography = resolveTypography(brand.font_overrides as FontOverrides | null);

  // The stored current_stop is an index into the brand's active stops. If an
  // admin deletes or archives a stop, that index may now point past the end
  // (or at a different stop entirely). Clamp to the valid range and persist
  // the fallback so the candidate always lands somewhere real.
  const storedStopIdx = session.current_stop ?? 0;
  const currentStopIdx = Math.min(
    Math.max(0, storedStopIdx),
    stops.length - 1,
  );
  const storedStepIdx = session.current_step ?? 0;
  const currentStopKey_ = stops[currentStopIdx]?.stop_key;
  const stepsInCurrentStop = currentStopKey_
    ? (stepsRows ?? []).filter((r) => r.stop_key === currentStopKey_).length
    : 0;
  const currentStepIdx = Math.min(
    Math.max(0, storedStepIdx),
    Math.max(0, stepsInCurrentStop - 1),
  );
  if (storedStopIdx !== currentStopIdx || storedStepIdx !== currentStepIdx) {
    await app
      .from("candidates_in_portal")
      .update({
        current_stop: currentStopIdx,
        current_step: currentStepIdx,
      })
      .eq("id", session.id);
  }

  const initialStopIdx = currentStopIdx;
  const initialStepIdx = currentStepIdx;

  const fontClasses = `${baloo2.variable} ${nunitoSans.variable} ${montserrat.variable}`;

  const initialApplicationAnswers: Record<string, unknown> = {};
  for (const row of applicationRows ?? []) {
    initialApplicationAnswers[row.field_key] = row.field_value;
  }

  // --- Journey card state ---
  // Recent activity: any step completion within the last 2 days.
  const progressList = progressRows ?? [];
  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const recentlyActive = progressList.some(
    (r) => r.completed_at && new Date(r.completed_at).getTime() >= twoDaysAgo,
  );
  // Count distinct step_keys completed in the CURRENT stop — feeds the
  // "between stops" variant.
  const currentStop = stops[currentStopIdx];
  const currentStopKey = currentStop?.stop_key;
  const currentStopCompletedKeys = new Set(
    progressList
      .filter((r) => r.stop_key === currentStopKey)
      .map((r) => r.step_key)
      .filter((k): k is string => typeof k === "string"),
  );
  const currentStopStepCount =
    currentStopKey && stepsByStop[currentStopKey]
      ? stepsByStop[currentStopKey].length
      : 0;
  const lastActivityAt = session.last_activity_at
    ? new Date(session.last_activity_at)
    : null;
  const journeyState = resolveJourneyCardState({
    currentStopIdx,
    stops,
    lastActivityAt,
    recentlyActive,
    currentStopStepsCompleted: currentStopCompletedKeys.size,
    currentStopStepCount,
  });

  const onTourComplete = completeTourAction.bind(null, params.token);
  const onSaveApplicationAnswer = saveApplicationAnswerAction.bind(
    null,
    params.token,
  );
  const onSubmitApplication = submitApplicationAction.bind(
    null,
    params.token,
  );

  return (
    <main className={`portal-page ${fontClasses}`}>
      <CinematicShell
        brandName={brand.name}
        brandSlug={brand.slug}
        brandMarkHtml={brandMarkHtml}
        logoUrl={brand.logo_url ?? null}
        colors={colors}
        palette={palette}
        typography={typography}
        leader={leader}
        journeyState={journeyState}
        heroStats={heroStats}
        heroStripHeading={heroStripHeading}
        stops={stops}
        stepsByStop={stepsByStop}
        currentStopIdx={currentStopIdx}
        initialStopIdx={initialStopIdx}
        initialStepIdx={initialStepIdx}
        onTourComplete={onTourComplete}
        onSaveApplicationAnswer={onSaveApplicationAnswer}
        onSubmitApplication={onSubmitApplication}
        candidate={{
          first_name: candidate.first_name ?? "",
          last_name: candidate.last_name ?? null,
          email: candidate.email ?? "",
          phone: candidate.phone ?? null,
        }}
        initialApplicationAnswers={initialApplicationAnswers}
        isApplicationSubmitted={Boolean(session.is_app_submitted)}
      />
    </main>
  );
}
