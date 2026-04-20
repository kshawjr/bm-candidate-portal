import { notFound } from "next/navigation";
import { Fredoka, Nunito, Oswald, Open_Sans } from "next/font/google";
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

export const dynamic = "force-dynamic";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-fredoka",
  display: "swap",
});
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-nunito",
  display: "swap",
});
const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});
const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-open-sans",
  display: "swap",
});

// Maps brand.font_overrides.heading_font / body_font strings to the CSS vars
// that next/font registered above. Unknown family names fall back to Inter.
const FONT_VAR: Record<string, string> = {
  Fredoka: "var(--font-fredoka)",
  Nunito: "var(--font-nunito)",
  Oswald: "var(--font-oswald)",
  "Open Sans": "var(--font-open-sans)",
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
    .select("id, slug, name, parent_brand, tagline, colors, font_overrides")
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
  const typography = resolveTypography(brand.font_overrides as FontOverrides | null);
  const currentStopIdx = Math.min(session.current_stop ?? 0, stops.length - 1);
  const initialStopIdx = currentStopIdx;
  const initialStepIdx = Math.max(0, session.current_step ?? 0);

  const fontClasses = `${fredoka.variable} ${nunito.variable} ${oswald.variable} ${openSans.variable}`;

  return (
    <main className={`portal-page ${fontClasses}`}>
      <CinematicShell
        brandName={brand.name}
        brandMarkHtml={brandMarkHtml}
        parentBrand={brand.parent_brand}
        colors={colors}
        typography={typography}
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
