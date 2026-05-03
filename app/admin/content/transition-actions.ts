"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";
import { getAdminUser } from "@/lib/supabase-auth";

export interface StepTransitionFormData {
  heading: string;
  bodyMd: string | null;
  ctaLabel: string;
  isActive: boolean;
}

async function requireAdmin() {
  const user = await getAdminUser();
  if (!user) throw new Error("Not authorized");
  return user;
}

/**
 * Upsert a step's transition popup. Looks up brand_id off the step row so
 * the caller doesn't have to track it. step_transition_popups has a unique
 * (brand_id, step_id) constraint — re-saving updates the existing row.
 */
export async function saveStepTransitionAction(
  stepId: string,
  data: StepTransitionFormData,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  if (!data.heading.trim()) {
    return { success: false, error: "Heading is required" };
  }

  const app = createAppServiceClient();
  const { data: step, error: stepErr } = await app
    .from("steps_config")
    .select("id, brand_id")
    .eq("id", stepId)
    .maybeSingle();
  if (stepErr) return { success: false, error: stepErr.message };
  if (!step) return { success: false, error: "Step not found" };

  const { error } = await app.from("step_transition_popups").upsert(
    {
      brand_id: step.brand_id,
      step_id: stepId,
      heading: data.heading.trim(),
      body_md: data.bodyMd?.trim() || null,
      cta_label: data.ctaLabel.trim() || "Continue",
      is_active: data.isActive,
    },
    { onConflict: "brand_id,step_id" },
  );
  if (error) {
    return {
      success: false,
      error: `step_transition_popups upsert failed: ${error.message}`,
    };
  }

  revalidatePath("/admin/content");
  revalidatePath("/portal/[token]", "page");
  return { success: true };
}

export async function deleteStepTransitionAction(
  stepId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const app = createAppServiceClient();
  const { error } = await app
    .from("step_transition_popups")
    .delete()
    .eq("step_id", stepId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/content");
  revalidatePath("/portal/[token]", "page");
  return { success: true };
}
