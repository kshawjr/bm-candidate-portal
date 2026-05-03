import { notFound } from "next/navigation";
import { Baloo_2, Nunito_Sans, Montserrat } from "next/font/google";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import {
  CinematicShell,
  type Chapter,
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
import { OnboardingPopups } from "@/components/portal/onboarding-popups";
import type { ChapterVideoConfig } from "@/components/portal/chapter-video-popup";
import type {
  ChapterIntroBullet,
  ChapterIntroPopupConfig,
} from "@/components/portal/chapter-intro-popup";
import type { ChapterIntroBannerConfig } from "@/components/portal/chapter-intro-banner";
import type { StepTransitionPopupConfig } from "@/components/portal/step-transition-popup";
import {
  dismissChapterVideo,
  dismissChapterIntro,
  dismissStepTransition,
} from "./popup-actions";
import type { VideoProvider } from "@/lib/video-source";

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
      "id, candidate_id, current_chapter, current_step, is_app_submitted, last_activity_at, dismissed_chapter_videos, dismissed_chapter_intros, dismissed_step_transitions",
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
    { data: chapterVideoRows },
    { data: chapterIntroRows },
    { data: stepTransitionRows },
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
    app
      .from("chapter_videos")
      .select(
        "chapter_key, title, video_url, video_provider, description, cta_dismiss_label, is_active",
      )
      .eq("brand_id", brand.id)
      .eq("is_active", true),
    app
      .from("chapter_intro_popups")
      .select(
        "chapter_key, heading, body_md, hero_image_url, bullets, cta_dismiss_label, is_active, show_as_banner",
      )
      .eq("brand_id", brand.id)
      .eq("is_active", true),
    app
      .from("step_transition_popups")
      .select("step_id, heading, body_md, cta_label, is_active")
      .eq("brand_id", brand.id)
      .eq("is_active", true),
  ]);

  if (!chaptersRows?.length) {
    // Brand has no active chapters — either freshly seeded with nothing yet, or
    // every chapter has been archived in the admin. Render a friendly holding
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

  // Chapter 1 hero strip — 4 stats. Empty num drops the row.
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

  const chapters: Chapter[] = chaptersRows.map((s) => ({
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

  // The stored current_chapter is an index into the brand's active chapters. If an
  // admin deletes or archives a chapter, that index may now point past the end
  // (or at a different chapter entirely). Clamp to the valid range and persist
  // the fallback so the candidate always lands somewhere real.
  const storedChapterIdx = session.current_chapter ?? 0;
  const currentChapterIdx = Math.min(
    Math.max(0, storedChapterIdx),
    chapters.length - 1,
  );
  const storedStepIdx = session.current_step ?? 0;
  const currentChapterKey_ = chapters[currentChapterIdx]?.chapter_key;
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

  const initialChapterIdx = currentChapterIdx;
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
  // Count distinct step_keys completed in the CURRENT chapter — feeds the
  // "between chapters" variant.
  const currentChapter = chapters[currentChapterIdx];
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
    chapters,
    lastActivityAt,
    recentlyActive,
    currentChapterStepsCompleted: currentChapterCompletedKeys.size,
    currentChapterStepCount,
  });

  // --- Onboarding popups ---
  // Both chapter video and chapter intro are per-chapter: gated on the
  // candidate's CURRENT chapter_key not appearing in the corresponding
  // dismissal array. Both queries already filter to is_active.
  const dismissedChapterIntros: string[] = Array.isArray(
    session.dismissed_chapter_intros,
  )
    ? (session.dismissed_chapter_intros as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];

  // Per-chapter transition videos. Pre-parse every row, then derive the
  // current chapter's video below (gated on dismissed_chapter_videos).
  const dismissedChapterVideos: string[] = Array.isArray(
    session.dismissed_chapter_videos,
  )
    ? (session.dismissed_chapter_videos as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];
  const videoByChapterKey: Record<string, ChapterVideoConfig> = {};
  for (const row of chapterVideoRows ?? []) {
    const key = row.chapter_key as string;
    if (!key) continue;
    videoByChapterKey[key] = {
      chapterKey: key,
      title: (row.title as string | null) ?? null,
      videoUrl: (row.video_url as string) ?? "",
      videoProvider: row.video_provider as VideoProvider,
      description: (row.description as string | null) ?? null,
      ctaDismissLabel:
        (row.cta_dismiss_label as string | null) ?? "Got it",
    };
  }

  // Pre-parse every chapter intro row once. Both the popup (one-shot) and
  // banner (persistent per chapter) read from the same source — the only
  // gating difference is the show_as_banner column for banners and the
  // dismissed_chapter_intros array for popups.
  interface ParsedIntroRow {
    chapterKey: string;
    heading: string;
    bodyMd: string;
    heroImageUrl: string | null;
    bullets: ChapterIntroBullet[];
    ctaDismissLabel: string;
    showAsBanner: boolean;
  }
  const parsedIntroByKey: Record<string, ParsedIntroRow> = {};
  for (const introRow of chapterIntroRows ?? []) {
    const key = introRow.chapter_key as string;
    if (!key) continue;
    const rawBullets: unknown = introRow.bullets;
    const bullets: ChapterIntroBullet[] = Array.isArray(rawBullets)
      ? (rawBullets as unknown[])
          .map((b) => {
            if (!b || typeof b !== "object") return null;
            const obj = b as { icon?: unknown; text?: unknown };
            const text = typeof obj.text === "string" ? obj.text : "";
            if (!text) return null;
            return {
              icon: typeof obj.icon === "string" ? obj.icon : "",
              text,
            };
          })
          .filter((b): b is ChapterIntroBullet => b !== null)
      : [];
    parsedIntroByKey[key] = {
      chapterKey: key,
      heading: (introRow.heading as string) ?? "",
      bodyMd: (introRow.body_md as string) ?? "",
      heroImageUrl: (introRow.hero_image_url as string | null) ?? null,
      bullets,
      ctaDismissLabel:
        (introRow.cta_dismiss_label as string | null) ?? "Let's go",
      // Default true so brands seeded before this column existed still get
      // banners — matches the migration default.
      showAsBanner:
        (introRow as { show_as_banner?: boolean | null }).show_as_banner !==
        false,
    };
  }

  // Chapter video + intro popup are both gated on the candidate's CURRENT
  // chapter (not what they're browsing). When current_chapter advances, the
  // next chapter's onboarding fires.
  const currentChapterKeyForOnboarding =
    chapters[currentChapterIdx]?.chapter_key;

  let chapterVideo: ChapterVideoConfig | null = null;
  if (currentChapterKeyForOnboarding) {
    const video = videoByChapterKey[currentChapterKeyForOnboarding];
    if (video && !dismissedChapterVideos.includes(currentChapterKeyForOnboarding)) {
      chapterVideo = video;
    }
  }

  let chapterIntroPopup: ChapterIntroPopupConfig | null = null;
  if (currentChapterKeyForOnboarding) {
    const parsed = parsedIntroByKey[currentChapterKeyForOnboarding];
    if (parsed && !dismissedChapterIntros.includes(currentChapterKeyForOnboarding)) {
      chapterIntroPopup = {
        chapterKey: parsed.chapterKey,
        heading: parsed.heading,
        bodyMd: parsed.bodyMd,
        heroImageUrl: parsed.heroImageUrl,
        bullets: parsed.bullets,
        ctaDismissLabel: parsed.ctaDismissLabel,
      };
    }
  }

  // Banners: every chapter whose intro row is active AND show_as_banner=true.
  // The shell looks up the right one for the currently selected chapter.
  const bannersByChapterKey: Record<string, ChapterIntroBannerConfig> = {};
  for (const parsed of Object.values(parsedIntroByKey)) {
    if (!parsed.showAsBanner) continue;
    bannersByChapterKey[parsed.chapterKey] = {
      chapterKey: parsed.chapterKey,
      heading: parsed.heading,
      bodyMd: parsed.bodyMd,
      heroImageUrl: parsed.heroImageUrl,
      bullets: parsed.bullets,
    };
  }

  // Step transition popups — keyed by step_id. The shell looks up the
  // newly-selected step's id and fires the toast on step change (not on
  // initial render).
  const transitionsByStepId: Record<string, StepTransitionPopupConfig> = {};
  for (const row of stepTransitionRows ?? []) {
    const stepId = row.step_id as string;
    if (!stepId) continue;
    transitionsByStepId[stepId] = {
      stepId,
      heading: (row.heading as string) ?? "",
      bodyMd: (row.body_md as string | null) ?? null,
      ctaLabel: (row.cta_label as string | null) ?? "Continue",
    };
  }
  const dismissedStepTransitions: string[] = Array.isArray(
    session.dismissed_step_transitions,
  )
    ? (session.dismissed_step_transitions as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];

  const onDismissChapterVideo = dismissChapterVideo.bind(null, params.token);
  const onDismissChapterIntro = dismissChapterIntro.bind(null, params.token);
  const onDismissStepTransition = dismissStepTransition.bind(
    null,
    params.token,
  );

  // Chapter progress drives the sidebar's "Chapter N · X%" bar. Use
  // current_step (already clamped above) as the completed count — this
  // matches the visual step strip and behaves correctly across all our
  // current advance flows (tour, schedule book, application submit).
  const currentChapterCompletedSteps = currentStepIdx;

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
        chapters={chapters}
        stepsByChapter={stepsByChapter}
        currentChapterIdx={currentChapterIdx}
        initialChapterIdx={initialChapterIdx}
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
        bannersByChapterKey={bannersByChapterKey}
        transitionsByStepId={transitionsByStepId}
        initialDismissedStepTransitions={dismissedStepTransitions}
        onDismissStepTransition={onDismissStepTransition}
        currentChapterCompletedSteps={currentChapterCompletedSteps}
      />
      <DevResetButton token={params.token} />
      <OnboardingPopups
        // Re-key on the candidate's current chapter so React remounts the
        // sequencer when current_chapter advances. This wipes the local
        // videoDismissed/chapterDismissed flags between chapters — without
        // it, the next chapter's video + intro would be blocked by the
        // previous chapter's dismissals still sitting in component state.
        key={currentChapterKeyForOnboarding ?? "no-chapter"}
        chapterVideo={chapterVideo}
        chapterIntro={chapterIntroPopup}
        onDismissChapterVideo={onDismissChapterVideo}
        onDismissChapterIntro={onDismissChapterIntro}
      />
    </main>
  );
}
