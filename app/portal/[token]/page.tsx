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
  bookSlotAction,
  cancelBookingAction,
  completeTourAction,
  getAvailableSlotsAction,
  saveApplicationAnswerAction,
  submitApplicationAction,
  advanceStepAction,
} from "./actions";
import { isGCalConfigured } from "@/lib/google-calendar";
import { resolveJourneyCardState } from "@/components/sidebar/journey-card";
import type { ExistingBooking } from "@/components/content-types/schedule-renderer";
import { DevResetButton } from "@/components/portal/dev-reset-button";

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
      "id, candidate_id, current_chapter, current_step, is_app_submitted, last_activity_at",
    )
    .eq("token", params.token)
    .maybeSingle();
  if (!session) notFound();

  const core = createCoreClient();
  const { data: candidate } = await core
    .from("candidates")
    .select(
      "first_name, last_name, email, phone, brand_id, assigned_rep_id",
    )
    .eq("id", session.candidate_id)
    .maybeSingle();
  if (!candidate) notFound();

  const { data: brand } = await core
    .from("brands")
    .select(
      "id, slug, name, short_name, tagline, colors, font_overrides, logo_url",
    )
    .eq("id", candidate.brand_id)
    .maybeSingle();
  if (!brand) notFound();

  const brandShortName =
    (((brand as { short_name?: string | null }).short_name) ?? "").trim() ||
    (brand.name as string);

  const assignedRepId =
    ((candidate as { assigned_rep_id?: string | null }).assigned_rep_id) ?? null;
  const { data: rep } = assignedRepId
    ? await core
        .from("reps")
        .select("id, name, calendar_email, is_active")
        .eq("id", assignedRepId)
        .maybeSingle()
    : { data: null };
  const activeRep =
    rep && (rep as { is_active?: boolean }).is_active !== false
      ? {
          id: (rep as { id: string }).id,
          name: (rep as { name: string }).name,
          calendarEmail: (rep as { calendar_email: string }).calendar_email,
        }
      : null;

  const [
    { data: portalContent },
    { data: chaptersRows },
    { data: stepsRows },
    { data: applicationRows },
    { data: progressRows },
    { data: bookingsRows },
  ] = await Promise.all([
    core
      .from("portal_content")
      .select("content_key, body, data")
      .eq("brand_id", brand.id),
    app
      .from("chapters_config")
      .select("chapter_key, position, label, name, icon")
      .eq("brand_id", brand.id)
      .eq("is_archived", false)
      .order("position"),
    app
      .from("steps_config")
      .select(
        "id, chapter_key, position, step_key, label, description, content_type, config, content_cards",
      )
      .eq("brand_id", brand.id)
      .eq("is_archived", false)
      .order("chapter_key")
      .order("position"),
    app
      .from("application_responses")
      .select("field_key, field_value")
      .eq("candidate_in_portal_id", session.id),
    app
      .from("candidate_progress")
      .select("chapter_key, step_key, completed_at")
      .eq("candidate_in_portal_id", session.id),
    app
      .from("bookings")
      .select("id, step_id, start_time, end_time, meeting_url, status")
      .eq("candidate_in_portal_id", session.id),
  ]);

  if (!chaptersRows?.length) {
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

  const stops: Stop[] = chaptersRows.map((s) => ({
    chapter_key: s.chapter_key,
    position: s.position,
    label: s.label,
    name: s.name,
    icon: s.icon,
  }));

  const stepsByChapter: Record<string, Step[]> = {};
  for (const row of stepsRows ?? []) {
    const step: Step = {
      id: row.id,
      step_key: row.step_key,
      chapter_key: row.chapter_key,
      position: row.position,
      label: row.label,
      description: row.description,
      content_type: row.content_type as ContentType,
      config: (row.config ?? {}) as Record<string, unknown>,
      content_cards: Array.isArray(row.content_cards) ? row.content_cards : [],
    };
    (stepsByChapter[row.chapter_key] ??= []).push(step);
  }
  for (const key of Object.keys(stepsByChapter)) {
    stepsByChapter[key].sort((a, b) => a.position - b.position);
  }

  const colors = brand.colors as BrandColorsWithPalette;
  const palette = colors.palette ?? {};
  const typography = resolveTypography(brand.font_overrides as FontOverrides | null);

  // The stored current_chapter is an index into the brand's active stops. If an
  // admin deletes or archives a stop, that index may now point past the end
  // (or at a different stop entirely). Clamp to the valid range and persist
  // the fallback so the candidate always lands somewhere real.
  const storedChapterIdx = session.current_chapter ?? 0;
  const currentChapterIdx = Math.min(
    Math.max(0, storedChapterIdx),
    stops.length - 1,
  );
  const storedStepIdx = session.current_step ?? 0;
  const currentChapterKey_ = stops[currentChapterIdx]?.chapter_key;
  const stepsInCurrentChapter = currentChapterKey_
    ? (stepsRows ?? []).filter((r) => r.chapter_key === currentChapterKey_).length
    : 0;
  const currentStepIdx = Math.min(
    Math.max(0, storedStepIdx),
    Math.max(0, stepsInCurrentChapter - 1),
  );
  if (storedChapterIdx !== currentChapterIdx || storedStepIdx !== currentStepIdx) {
    await app
      .from("candidates_in_portal")
      .update({
        current_chapter: currentChapterIdx,
        current_step: currentStepIdx,
      })
      .eq("id", session.id);
  }

  const initialStopIdx = currentChapterIdx;
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
  const currentChapter = stops[currentChapterIdx];
  const currentChapterKey = currentChapter?.chapter_key;
  const currentChapterCompletedKeys = new Set(
    progressList
      .filter((r) => r.chapter_key === currentChapterKey)
      .map((r) => r.step_key)
      .filter((k): k is string => typeof k === "string"),
  );
  const currentChapterStepCount =
    currentChapterKey && stepsByChapter[currentChapterKey]
      ? stepsByChapter[currentChapterKey].length
      : 0;
  const lastActivityAt = session.last_activity_at
    ? new Date(session.last_activity_at)
    : null;
  const journeyState = resolveJourneyCardState({
    currentChapterIdx,
    stops,
    lastActivityAt,
    recentlyActive,
    currentChapterStepsCompleted: currentChapterCompletedKeys.size,
    currentChapterStepCount,
  });

  const onTourComplete = completeTourAction.bind(null, params.token);
  const onStepAdvance = advanceStepAction.bind(null, params.token);
  const onSaveApplicationAnswer = saveApplicationAnswerAction.bind(
    null,
    params.token,
  );
  const onSubmitApplication = submitApplicationAction.bind(
    null,
    params.token,
  );
  const onGetSlots = getAvailableSlotsAction.bind(null, params.token);
  const onBookSlot = bookSlotAction.bind(null, params.token);
  const onCancelBooking = cancelBookingAction.bind(null, params.token);

  const bookingsByStepId: Record<string, ExistingBooking> = {};
  for (const b of bookingsRows ?? []) {
    if (b.status !== "confirmed") continue;
    bookingsByStepId[b.step_id as string] = {
      id: b.id as string,
      start_time: b.start_time as string,
      end_time: b.end_time as string,
      meeting_url: (b.meeting_url as string | null) ?? null,
      status: b.status as "confirmed" | "cancelled",
    };
  }

  // Scheduling resolves the booking calendar from the candidate's assigned
  // rep (new as of PR 16). The brand's own leader card copy is still used
  // as a fallback display name elsewhere in the shell.
  const hasAssignedRep = !!activeRep;
  const scheduleAdvisorName = activeRep?.name ?? null;
  const scheduleAdvisorEmail = activeRep?.calendarEmail ?? null;
  const scheduleConfigured = isGCalConfigured();

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
        stepsByChapter={stepsByChapter}
        currentChapterIdx={currentChapterIdx}
        initialStopIdx={initialStopIdx}
        initialStepIdx={initialStepIdx}
        onTourComplete={onTourComplete}
        onStepAdvance={onStepAdvance}
        onSaveApplicationAnswer={onSaveApplicationAnswer}
        onSubmitApplication={onSubmitApplication}
        onGetSlots={onGetSlots}
        onBookSlot={onBookSlot}
        onCancelBooking={onCancelBooking}
        candidate={{
          first_name: candidate.first_name ?? "",
          last_name: candidate.last_name ?? null,
          email: candidate.email ?? "",
          phone: candidate.phone ?? null,
        }}
        initialApplicationAnswers={initialApplicationAnswers}
        isApplicationSubmitted={Boolean(session.is_app_submitted)}
        bookingsByStepId={bookingsByStepId}
        hasAssignedRep={hasAssignedRep}
        advisorName={scheduleAdvisorName}
        advisorEmail={scheduleAdvisorEmail}
        brandShortName={brandShortName}
        isGCalConfigured={scheduleConfigured}
      />
      <DevResetButton token={params.token} />
    </main>
  );
}
