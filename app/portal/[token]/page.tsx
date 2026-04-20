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
    .select("id, candidate_id, current_stop, current_step, is_app_submitted")
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
  ] = await Promise.all([
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
    app
      .from("application_responses")
      .select("field_key, field_value")
      .eq("candidate_in_portal_id", session.id),
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

  // Sidebar "By the numbers" card — 3 stats. Empty num drops the row.
  const sidebarStats = [1, 2, 3]
    .map((n) => ({
      num: pickText(content, `sidebar_stat_${n}_num`),
      label: pickText(content, `sidebar_stat_${n}_label`),
    }))
    .filter((s) => s.num.length > 0);
  const sidebarStatsHeading = pickText(
    content,
    "sidebar_stats_heading",
    "By the numbers",
  );

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
    };
    (stepsByStop[row.stop_key] ??= []).push(step);
  }
  for (const key of Object.keys(stepsByStop)) {
    stepsByStop[key].sort((a, b) => a.position - b.position);
  }

  const colors = brand.colors as BrandColorsWithPalette;
  const palette = colors.palette ?? {};
  const typography = resolveTypography(brand.font_overrides as FontOverrides | null);
  const currentStopIdx = Math.min(session.current_stop ?? 0, stops.length - 1);
  const initialStopIdx = currentStopIdx;
  const initialStepIdx = Math.max(0, session.current_step ?? 0);

  const fontClasses = `${baloo2.variable} ${nunitoSans.variable} ${montserrat.variable}`;

  const initialApplicationAnswers: Record<string, unknown> = {};
  for (const row of applicationRows ?? []) {
    initialApplicationAnswers[row.field_key] = row.field_value;
  }

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
        sidebarStats={sidebarStats}
        sidebarStatsHeading={sidebarStatsHeading}
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
