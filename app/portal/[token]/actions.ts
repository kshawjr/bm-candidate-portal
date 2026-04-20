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
