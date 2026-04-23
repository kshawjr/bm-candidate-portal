import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase-auth";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import {
  CandidatesTable,
  type CandidateRow,
} from "@/components/admin/candidates-table";

export const dynamic = "force-dynamic";

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
    ? await core.from("brands").select("id, name").in("id", brandIds)
    : { data: [] };
  const brandNameById = new Map<string, string>(
    (brands ?? []).map((b) => [b.id as string, (b.name as string) ?? ""]),
  );

  const candidateById = new Map(
    (candidates ?? []).map((c) => [c.id as string, c] as const),
  );

  // Chapter labels per brand so the Position column can show
  // "Chapter 2 — First chat" instead of just "Chapter 2 · Step 0".
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

  const rows: CandidateRow[] = sessionList.map((s) => {
    const candidate = s.candidate_id
      ? candidateById.get(s.candidate_id as string)
      : null;
    const firstName = (candidate?.first_name as string | null) ?? "";
    const lastName = (candidate?.last_name as string | null) ?? "";
    const name = [firstName, lastName].filter(Boolean).join(" ").trim();
    const email = (candidate?.email as string | null) ?? "";
    const brandId = (candidate?.brand_id as string | null) ?? "";
    const brandName = brandId ? brandNameById.get(brandId) ?? "" : "";
    const chapterIdx = (s.current_chapter as number | null) ?? 0;
    const stepIdx = (s.current_step as number | null) ?? 0;
    const token = s.token as string;
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
