import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase-auth";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import {
  CandidatesTable,
  type CandidateRow,
} from "@/components/admin/candidates-table";
import {
  LIQUID_CAPITAL_RANGES,
  NET_WORTH_RANGES,
  CREDIT_SCORE_RANGES,
  MOTIVATIONS,
  humanizeOption,
} from "@/lib/application-options";
import { brandClosingQuestion } from "@/lib/brand-closing-questions";

export const dynamic = "force-dynamic";

// Admin-surfaced application answers. Keep in sync with the renderer's
// field_key names. PR 37: dropped age_range / self_descriptor and added
// motivation_elaboration, has_felony / felony_explanation, the *_other_text
// keys for the chip questions, and brand_closing_response.
const SURFACED_FIELD_KEYS = [
  "liquid_capital_range",
  "net_worth_range",
  "credit_score_range",
  "motivation",
  "motivation_other_text",
  "motivation_elaboration",
  "zip_code",
  "derived_city",
  "derived_state",
  "target_location_confirmed",
  "target_location_other",
  "has_filed_bankruptcy",
  "bankruptcy_explanation",
  "has_felony",
  "felony_explanation",
  "opening_timeline_other_text",
  "involvement_level_other_text",
  "growth_plan_other_text",
  "brand_closing_response",
  "brand_closing_response_other",
] as const;

export default async function AdminCandidatesPage() {
  const user = await getAdminUser();
  if (!user) redirect("/admin/sign-in");

  const app = createAppServiceClient();
  const core = createCoreClient();

  const { data: sessions } = await app
    .from("candidates_in_portal")
    .select(
      "id, token, candidate_id, current_chapter, current_step, last_activity_at",
    )
    .order("last_activity_at", { ascending: false });

  const sessionList = sessions ?? [];

  const candidateIds = Array.from(
    new Set(
      sessionList
        .map((s) => s.candidate_id as string | null)
        .filter((id): id is string => typeof id === "string"),
    ),
  );

  const { data: candidates } = candidateIds.length
    ? await core
        .from("candidates")
        .select("id, first_name, last_name, email, brand_id")
        .in("id", candidateIds)
    : { data: [] };

  const brandIds = Array.from(
    new Set(
      (candidates ?? [])
        .map((c) => c.brand_id as string | null)
        .filter((id): id is string => typeof id === "string"),
    ),
  );
  const { data: brands } = brandIds.length
    ? await core.from("brands").select("id, name, slug").in("id", brandIds)
    : { data: [] };
  const brandById = new Map<
    string,
    { name: string; slug: string }
  >(
    (brands ?? []).map((b) => [
      b.id as string,
      {
        name: (b.name as string) ?? "",
        slug: (b.slug as string) ?? "",
      },
    ]),
  );

  const candidateById = new Map(
    (candidates ?? []).map((c) => [c.id as string, c] as const),
  );

  const { data: chapters } = brandIds.length
    ? await app
        .from("chapters_config")
        .select("brand_id, position, label")
        .in("brand_id", brandIds)
        .eq("is_archived", false)
    : { data: [] };
  const chapterLabelAt = (brandId: string, pos: number): string | null => {
    const match = (chapters ?? []).find(
      (c) => c.brand_id === brandId && c.position === pos,
    );
    return match ? ((match.label as string) ?? null) : null;
  };

  const sessionIds = sessionList.map((s) => s.id as string);
  const { data: answerRows } = sessionIds.length
    ? await app
        .from("application_responses")
        .select("candidate_in_portal_id, field_key, field_value")
        .in("candidate_in_portal_id", sessionIds)
        .in("field_key", SURFACED_FIELD_KEYS as unknown as string[])
    : { data: [] };
  const answersBySession = new Map<string, Record<string, unknown>>();
  for (const row of answerRows ?? []) {
    const sid = row.candidate_in_portal_id as string;
    const key = row.field_key as string;
    const bucket = answersBySession.get(sid) ?? {};
    bucket[key] = row.field_value;
    answersBySession.set(sid, bucket);
  }

  const pickString = (v: unknown): string =>
    typeof v === "string" ? v : "";
  const pickBool = (v: unknown): boolean | null =>
    typeof v === "boolean" ? v : null;

  const rows: CandidateRow[] = sessionList.map((s) => {
    const candidate = s.candidate_id
      ? candidateById.get(s.candidate_id as string)
      : null;
    const firstName = (candidate?.first_name as string | null) ?? "";
    const lastName = (candidate?.last_name as string | null) ?? "";
    const name = [firstName, lastName].filter(Boolean).join(" ").trim();
    const email = (candidate?.email as string | null) ?? "";
    const brandId = (candidate?.brand_id as string | null) ?? "";
    const brand = brandId ? brandById.get(brandId) : null;
    const brandName = brand?.name ?? "";
    const brandSlug = brand?.slug ?? "";
    const chapterIdx = (s.current_chapter as number | null) ?? 0;
    const stepIdx = (s.current_step as number | null) ?? 0;
    const token = s.token as string;
    const a = answersBySession.get(s.id as string) ?? {};

    const liquidRaw = pickString(a.liquid_capital_range);
    const netWorthRaw = pickString(a.net_worth_range);
    const creditRaw = pickString(a.credit_score_range);

    // Motivation became multi-select in PR 37. Older rows may store a
    // single string; tolerate both shapes.
    const rawMotivation = a.motivation;
    const motivationValues: string[] = Array.isArray(rawMotivation)
      ? (rawMotivation as unknown[]).filter(
          (v): v is string => typeof v === "string",
        )
      : typeof rawMotivation === "string" && rawMotivation.length > 0
        ? [rawMotivation]
        : [];
    const motivationOther = pickString(a.motivation_other_text).trim();
    let motivationLabel: string | null = null;
    if (motivationValues.length > 0) {
      const labels = motivationValues.map((v) => {
        if (v === "other" && motivationOther) {
          return `Other (${motivationOther})`;
        }
        return humanizeOption(v, MOTIVATIONS);
      });
      motivationLabel = labels.join(", ");
    }
    const motivationElaboration = pickString(a.motivation_elaboration).trim();

    const zipCode = pickString(a.zip_code);
    const derivedCity = pickString(a.derived_city);
    const derivedState = pickString(a.derived_state);
    const derivedPlace =
      derivedCity && derivedState ? `${derivedCity}, ${derivedState}` : "";
    const targetConfirmed = pickBool(a.target_location_confirmed);
    const targetOther = pickString(a.target_location_other).trim();

    const bankruptcyAnswer = pickBool(a.has_filed_bankruptcy);
    const bankruptcyExplanation = pickString(a.bankruptcy_explanation).trim();
    const felonyAnswer = pickBool(a.has_felony);
    const felonyExplanation = pickString(a.felony_explanation).trim();

    const openingTimelineOther = pickString(
      a.opening_timeline_other_text,
    ).trim();
    const involvementLevelOther = pickString(
      a.involvement_level_other_text,
    ).trim();
    const growthPlanOther = pickString(a.growth_plan_other_text).trim();

    // Resolve the per-brand closing label by looking up the chip set the
    // candidate would have seen. Falls back to the raw value for unknown
    // brands so historical rows still surface.
    const closingValue = pickString(a.brand_closing_response);
    const closingOther = pickString(a.brand_closing_response_other).trim();
    let brandClosingLabel: string | null = null;
    if (closingValue) {
      if (closingValue === "other" && closingOther) {
        brandClosingLabel = `Other (${closingOther})`;
      } else if (brandSlug) {
        const closing = brandClosingQuestion(brandSlug);
        const match = closing.options.find((o) => o.value === closingValue);
        brandClosingLabel = match ? match.label : `${closingValue} (legacy)`;
      } else {
        brandClosingLabel = closingValue;
      }
    }

    return {
      token,
      candidateId: (s.candidate_id as string) ?? "",
      name,
      email,
      brandName,
      chapterLabel: brandId ? chapterLabelAt(brandId, chapterIdx) : null,
      chapterNumber: chapterIdx + 1,
      stepNumber: stepIdx + 1,
      lastActivityAt: (s.last_activity_at as string | null) ?? null,
      isTest: token.startsWith("test-"),
      liquidCapitalLabel: liquidRaw
        ? humanizeOption(liquidRaw, LIQUID_CAPITAL_RANGES)
        : null,
      netWorthLabel: netWorthRaw
        ? humanizeOption(netWorthRaw, NET_WORTH_RANGES)
        : null,
      creditScoreLabel: creditRaw
        ? humanizeOption(creditRaw, CREDIT_SCORE_RANGES)
        : null,
      motivationLabel,
      motivationElaboration: motivationElaboration || null,
      brandClosingLabel,
      zipCode: zipCode || null,
      derivedPlace: derivedPlace || null,
      targetConfirmed,
      targetOther: targetOther || null,
      bankruptcyAnswer,
      bankruptcyExplanation: bankruptcyExplanation || null,
      felonyAnswer,
      felonyExplanation: felonyExplanation || null,
      openingTimelineOther: openingTimelineOther || null,
      involvementLevelOther: involvementLevelOther || null,
      growthPlanOther: growthPlanOther || null,
    };
  });

  return (
    <div className="admin-page">
      <h1 className="admin-h1">Candidates</h1>
      <p className="admin-muted">
        All portal sessions. Reset wipes a candidate&apos;s progress back to
        Chapter 1 · Step 1.
      </p>
      <CandidatesTable rows={rows} />
    </div>
  );
}
