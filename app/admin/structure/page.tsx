import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import { StructureEditor } from "@/components/admin/structure-editor";
import type {
  AdminChapterRow,
  ChapterIntroInitial,
  ChapterVideoInitial,
  ChapterCompleteInitial,
} from "@/components/admin/structure-editor";
import {
  archiveChapterAction,
  createChapterAction,
  deleteChapterAction,
  reorderChaptersAction,
  updateChapterAction,
} from "./actions";
import {
  saveChapterIntroAction,
  deleteChapterIntroAction,
  uploadChapterIntroHeroAction,
  saveChapterVideoAction,
  deleteChapterVideoAction,
  uploadChapterVideoAction,
  saveChapterCompleteAction,
  deleteChapterCompleteAction,
} from "./popup-actions";
import type { VideoProvider } from "@/lib/video-source";

export const dynamic = "force-dynamic";

interface Props {
  searchParams?: { brand?: string };
}

export default async function StructurePage({ searchParams }: Props) {
  // PR 50: matching middleware-level admin auth bypass (PR 47) + sub-page
  // unblock. Page-level getAdminUser/redirect previously bounced unauthed
  // users to /admin/sign-in, which broke now that the middleware gate is
  // off. Restore the gate when re-enabling per TODO_AUTH.md.

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
  const [
    { data: chapterRows },
    { data: stepRows },
    { data: introRows },
    { data: videoRows },
    { data: completeRows },
  ] = await Promise.all([
    app
      .from("chapters_config")
      .select(
        "id, chapter_key, position, label, name, icon, description, is_archived",
      )
      .eq("brand_id", brand.id)
      .order("position"),
    app
      .from("steps_config")
      .select("id, chapter_key, is_archived")
      .eq("brand_id", brand.id),
    app
      .from("chapter_intro_popups")
      .select(
        "chapter_key, heading, body_md, hero_image_url, bullets, cta_dismiss_label, is_active, show_as_banner, partner_callout_text, pre_dismiss_checklist, scarcity_framing, slots_remaining, continue_hint",
      )
      .eq("brand_id", brand.id),
    app
      .from("chapter_videos")
      .select(
        "chapter_key, title, video_url, video_provider, description, cta_dismiss_label, is_active, updated_at",
      )
      .eq("brand_id", brand.id),
    app
      .from("chapter_complete_popups")
      .select("chapter_key, heading, body_md, cta_label, is_active")
      .eq("brand_id", brand.id),
  ]);

  const stepCounts: Record<string, { total: number; active: number }> = {};
  for (const row of stepRows ?? []) {
    const bucket = (stepCounts[row.chapter_key] ??= { total: 0, active: 0 });
    bucket.total += 1;
    if (!row.is_archived) bucket.active += 1;
  }

  const introByKey: Record<string, ChapterIntroInitial> = {};
  for (const row of introRows ?? []) {
    const rawBullets: unknown = row.bullets;
    const bullets = Array.isArray(rawBullets)
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
          .filter((b): b is { icon: string; text: string } => b !== null)
      : [];
    introByKey[row.chapter_key as string] = {
      heading: (row.heading as string) ?? "",
      bodyMd: (row.body_md as string) ?? "",
      heroImageUrl: (row.hero_image_url as string | null) ?? null,
      bullets,
      ctaDismissLabel: (row.cta_dismiss_label as string | null) ?? "Let's go",
      isActive: Boolean(row.is_active),
      // show_as_banner default-true is enforced at the DB layer; treat any
      // value other than explicit false as on, so rows seeded before the
      // column existed surface as banners.
      showAsBanner:
        (row as { show_as_banner?: boolean | null }).show_as_banner !== false,
      partnerCalloutText:
        (row as { partner_callout_text?: string | null })
          .partner_callout_text ?? null,
      preDismissChecklist: (() => {
        const raw = (row as { pre_dismiss_checklist?: unknown })
          .pre_dismiss_checklist;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const obj = raw as { heading?: unknown; items?: unknown };
        const items = Array.isArray(obj.items)
          ? (obj.items as unknown[]).filter(
              (v): v is string => typeof v === "string",
            )
          : [];
        return {
          heading:
            typeof obj.heading === "string" ? obj.heading : "",
          items,
        };
      })(),
      scarcityFraming: (() => {
        const raw = (row as { scarcity_framing?: unknown }).scarcity_framing;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const obj = raw as { heading?: unknown; body?: unknown };
        return {
          heading: typeof obj.heading === "string" ? obj.heading : "",
          body: typeof obj.body === "string" ? obj.body : "",
        };
      })(),
      slotsRemaining: (() => {
        const raw = (row as { slots_remaining?: unknown }).slots_remaining;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const obj = raw as { min?: unknown; max?: unknown };
        const min = typeof obj.min === "number" ? obj.min : null;
        const max = typeof obj.max === "number" ? obj.max : null;
        if (min === null || max === null) return null;
        return { min, max };
      })(),
      continueHint:
        (row as { continue_hint?: string | null }).continue_hint ?? null,
    };
  }

  const videoByKey: Record<string, ChapterVideoInitial> = {};
  for (const row of videoRows ?? []) {
    videoByKey[row.chapter_key as string] = {
      title: (row.title as string | null) ?? null,
      videoUrl: (row.video_url as string) ?? "",
      videoProvider: row.video_provider as VideoProvider,
      description: (row.description as string | null) ?? null,
      ctaDismissLabel: (row.cta_dismiss_label as string | null) ?? "Got it",
      isActive: Boolean(row.is_active),
      updatedAt: (row.updated_at as string | null) ?? null,
    };
  }

  const completeByKey: Record<string, ChapterCompleteInitial> = {};
  for (const row of completeRows ?? []) {
    completeByKey[row.chapter_key as string] = {
      heading: (row.heading as string) ?? "",
      bodyMd: (row.body_md as string | null) ?? null,
      ctaLabel: (row.cta_label as string | null) ?? "Keep going",
      isActive: Boolean(row.is_active),
    };
  }

  const chapters: AdminChapterRow[] = (chapterRows ?? []).map((s) => ({
    id: s.id,
    chapter_key: s.chapter_key,
    position: s.position,
    label: s.label,
    name: s.name,
    icon: (s.icon as string | null) ?? null,
    description: (s.description as string | null) ?? null,
    is_archived: !!s.is_archived,
    step_count: stepCounts[s.chapter_key]?.active ?? 0,
    step_count_total: stepCounts[s.chapter_key]?.total ?? 0,
    intro_popup: introByKey[s.chapter_key] ?? null,
    video: videoByKey[s.chapter_key] ?? null,
    complete_popup: completeByKey[s.chapter_key] ?? null,
  }));

  return (
    <StructureEditor
      brandId={brand.id}
      brandSlug={brand.slug}
      brandName={brand.name}
      chapters={chapters}
      createChapter={createChapterAction}
      updateChapter={updateChapterAction}
      deleteChapter={deleteChapterAction}
      archiveChapter={archiveChapterAction}
      reorderChapters={reorderChaptersAction}
      saveChapterIntro={saveChapterIntroAction}
      deleteChapterIntro={deleteChapterIntroAction}
      uploadChapterIntroHero={uploadChapterIntroHeroAction}
      saveChapterVideo={saveChapterVideoAction}
      deleteChapterVideo={deleteChapterVideoAction}
      uploadChapterVideo={uploadChapterVideoAction}
      saveChapterComplete={saveChapterCompleteAction}
      deleteChapterComplete={deleteChapterCompleteAction}
    />
  );
}
