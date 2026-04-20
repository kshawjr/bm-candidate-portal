"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";
import { getAdminUser } from "@/lib/supabase-auth";
import type { ContentCard } from "@/components/content-cards/types";

const STORAGE_BUCKET = "brand-assets";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

async function requireAdmin() {
  const user = await getAdminUser();
  if (!user) {
    throw new Error("Not authorized");
  }
  return user;
}

async function loadStepCards(stepId: string): Promise<ContentCard[]> {
  const app = createAppServiceClient();
  const { data, error } = await app
    .from("steps_config")
    .select("content_cards")
    .eq("id", stepId)
    .maybeSingle();
  if (error) throw new Error(`step lookup failed: ${error.message}`);
  if (!data) throw new Error(`step not found: ${stepId}`);
  return Array.isArray(data.content_cards)
    ? (data.content_cards as ContentCard[])
    : [];
}

async function saveStepCards(stepId: string, cards: ContentCard[]) {
  const app = createAppServiceClient();
  const { error } = await app
    .from("steps_config")
    .update({ content_cards: cards })
    .eq("id", stepId);
  if (error) throw new Error(`steps_config update failed: ${error.message}`);
}

/**
 * Upsert a single content card on a step.
 * - cardIndex omitted → append a new card at the end
 * - cardIndex provided → replace the card at that index
 */
export async function saveContentCardAction(
  stepId: string,
  card: ContentCard,
  cardIndex?: number,
): Promise<void> {
  await requireAdmin();
  const cards = await loadStepCards(stepId);
  const next = [...cards];
  if (typeof cardIndex === "number" && cardIndex >= 0 && cardIndex < next.length) {
    next[cardIndex] = card;
  } else {
    next.push(card);
  }
  await saveStepCards(stepId, next);
  revalidatePath("/admin/content");
  revalidatePath("/portal/[token]", "page");
}

/** Remove a single card by its index in the step's cards array. */
export async function deleteContentCardAction(
  stepId: string,
  cardIndex: number,
): Promise<void> {
  await requireAdmin();
  const cards = await loadStepCards(stepId);
  if (cardIndex < 0 || cardIndex >= cards.length) return;
  const next = cards.filter((_, i) => i !== cardIndex);
  await saveStepCards(stepId, next);
  revalidatePath("/admin/content");
  revalidatePath("/portal/[token]", "page");
}

/**
 * Upload an image file to brand-assets/{brandSlug}/content-cards/{ts}-{name}
 * and return the public URL. Validates size + MIME type server-side.
 */
export async function uploadCardImageAction(
  brandSlug: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file provided" };
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { error: "Image must be JPG, PNG, or WebP" };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "Image must be under 5 MB" };
  }
  if (!brandSlug || !/^[a-z0-9-]+$/.test(brandSlug)) {
    return { error: "Invalid brand slug" };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
  const path = `${brandSlug}/content-cards/${Date.now()}-${safeName}`;

  // brand-assets lives on the candidate-portal Supabase project (same one
  // hosting the logo PNGs from PR 4b). Use the service-role app client to
  // bypass storage RLS for the upload.
  const app = createAppServiceClient();
  const { error: upErr } = await app.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
  if (upErr) return { error: upErr.message };

  const { data: pub } = app.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) return { error: "Failed to resolve public URL" };

  return { url: pub.publicUrl };
}
