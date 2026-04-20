"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";

/**
 * Mark the brand tour complete for the candidate on this token, and advance
 * current_step to the supplied index. The caller (client shell) computes
 * nextStepIdx based on how many steps exist in the current stop, so this
 * action doesn't need to re-derive it.
 */
export async function completeTourAction(
  token: string,
  nextStepIdx: number,
): Promise<void> {
  const app = createAppServiceClient();
  const { error } = await app
    .from("candidates_in_portal")
    .update({
      is_tour_complete: true,
      current_step: nextStepIdx,
    })
    .eq("token", token);
  if (error) {
    throw new Error(`completeTourAction failed: ${error.message}`);
  }
  revalidatePath(`/portal/${token}`);
}

/**
 * Resolve a candidates_in_portal row by token and return its id. Used by the
 * save/submit actions below.
 */
async function portalIdForToken(
  app: ReturnType<typeof createAppServiceClient>,
  token: string,
): Promise<string> {
  const { data, error } = await app
    .from("candidates_in_portal")
    .select("id")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`portal lookup failed: ${error.message}`);
  if (!data) throw new Error(`no candidates_in_portal row for token`);
  return data.id as string;
}

/**
 * Upsert a single application answer. Called on advance-to-next-screen so
 * candidates never lose progress if they close the tab.
 */
export async function saveApplicationAnswerAction(
  token: string,
  fieldKey: string,
  fieldValue: unknown,
): Promise<void> {
  const app = createAppServiceClient();
  const portalId = await portalIdForToken(app, token);
  const { error } = await app
    .from("application_responses")
    .upsert(
      {
        candidate_in_portal_id: portalId,
        field_key: fieldKey,
        field_value: fieldValue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "candidate_in_portal_id,field_key" },
    );
  if (error) {
    throw new Error(`saveApplicationAnswer failed: ${error.message}`);
  }
  // No revalidatePath here — saves are high-frequency and the server side
  // doesn't need to re-render until submit.
}

/**
 * Submit the application. Writes any final answers in a single batch, flips
 * is_app_submitted, advances to Stop 2 (Say hi) at step 0, and logs a
 * candidate_progress audit row.
 */
export async function submitApplicationAction(
  token: string,
  finalAnswers: Record<string, unknown>,
): Promise<void> {
  const app = createAppServiceClient();
  const portalId = await portalIdForToken(app, token);

  // Batch upsert any answers that weren't already persisted on advance.
  const rows = Object.entries(finalAnswers).map(([field_key, field_value]) => ({
    candidate_in_portal_id: portalId,
    field_key,
    field_value,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length > 0) {
    const { error: upErr } = await app
      .from("application_responses")
      .upsert(rows, { onConflict: "candidate_in_portal_id,field_key" });
    if (upErr) throw new Error(`submit batch upsert failed: ${upErr.message}`);
  }

  // Flip submitted + advance to Stop 2 · Step 0 (Say hi).
  const { error: pErr } = await app
    .from("candidates_in_portal")
    .update({
      is_app_submitted: true,
      current_stop: 1,
      current_step: 0,
    })
    .eq("id", portalId);
  if (pErr) throw new Error(`submit flag update failed: ${pErr.message}`);

  // Audit: log completion of explore/app.
  const { error: prErr } = await app.from("candidate_progress").insert({
    candidate_in_portal_id: portalId,
    stop_key: "explore",
    step_key: "app",
  });
  if (prErr) throw new Error(`candidate_progress insert failed: ${prErr.message}`);

  revalidatePath(`/portal/${token}`);
}
