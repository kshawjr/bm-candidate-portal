"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";

/**
 * PR 40: candidate-side scheduling escape hatch. Stores a pending request
 * in booking_unavailable_requests so growth leaders can reach out manually.
 * No email/Slack notification yet — the admin candidates page surfaces a
 * badge per pending row.
 *
 * Validates only minimally: token resolves, email looks email-shaped,
 * available_times is non-empty. Notes are optional.
 */
export async function submitBookingUnavailableAction(
  token: string,
  email: string,
  availableTimes: string,
  notes: string,
): Promise<{ success: boolean; error?: string }> {
  const trimmedEmail = email.trim();
  const trimmedTimes = availableTimes.trim();
  if (!trimmedEmail || !/.+@.+\..+/.test(trimmedEmail)) {
    return { success: false, error: "Enter a valid email." };
  }
  if (!trimmedTimes) {
    return {
      success: false,
      error: "Tell us when works for you so we can reach out.",
    };
  }

  const app = createAppServiceClient();
  const { data: session, error: sessErr } = await app
    .from("candidates_in_portal")
    .select("id")
    .eq("token", token)
    .maybeSingle();
  if (sessErr || !session) {
    return { success: false, error: "Couldn't find your session." };
  }

  const { error: insErr } = await app
    .from("booking_unavailable_requests")
    .insert({
      candidate_in_portal_id: session.id,
      email: trimmedEmail,
      available_times: trimmedTimes,
      notes: notes.trim() || null,
      status: "pending",
    });
  if (insErr) {
    return {
      success: false,
      error: `booking_unavailable_requests insert failed: ${insErr.message}`,
    };
  }

  revalidatePath("/admin/candidates");
  return { success: true };
}
