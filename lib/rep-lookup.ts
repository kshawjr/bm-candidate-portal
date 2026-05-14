import "server-only";
import { zohoApi } from "@/lib/zoho-api";
import type { createCoreClient } from "@/lib/core-client";

// Default rep when no Zoho Owner → bmave-core.reps mapping is found.
// Kevin Shaw — covers test leads, orphaned Owners, transient API
// failures, and Zoho users not yet seeded into the reps table.
//
// Mirrors the FALLBACK_REP_ID in app/api/webhooks/zoho-lead-created/route.ts;
// keep the two in sync if the fallback rep ever changes.
export const FALLBACK_REP_ID = "c019d8dd-8ce4-4101-b0b3-35992d520aed";

type CoreClient = ReturnType<typeof createCoreClient>;

interface LookupOptions {
  /** Optional Zoho user ID. When supplied (e.g. from the
   *  zoho-lead-updated webhook payload) we fetch the user's full_name
   *  from Zoho's Users API so an auto-created rep gets a proper
   *  display name. When null we fall back to the email-prefix. */
  zohoUserId?: string | null;
}

/**
 * Resolve a Zoho Owner email → bmave-core.reps.id.
 *
 * Same five-rung resolution ladder as the inline `resolveAssignedRepId`
 * in app/api/webhooks/zoho-lead-created/route.ts:
 *
 *   1. Existing active rep with that email          → return rep.id
 *   2. Existing inactive rep with that email        → fallback
 *   3. No existing rep, email is @bmave.com         → auto-create, return new id
 *   4. No existing rep, email is non-bmave          → fallback
 *   5. Anything else fails                          → fallback
 *
 * Strictly best-effort. Rep assignment is a nice-to-have; it must
 * never block the caller. Errors get logged so a future repair job
 * can re-resolve.
 *
 * Unlike the existing inline resolver, this helper takes the email
 * directly — it does NOT re-fetch the Lead from Zoho. Use this from
 * webhooks where Owner.email is already on the payload.
 */
export async function lookupRepByEmail(
  email: string | null | undefined,
  core: CoreClient,
  options: LookupOptions = {},
): Promise<string> {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return FALLBACK_REP_ID;

  try {
    const { data: existingRep } = await core
      .from("reps")
      .select("id, is_active")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingRep?.is_active) {
      return existingRep.id as string;
    }

    if (existingRep && !existingRep.is_active) {
      console.warn(
        `[rep-lookup] rep ${normalizedEmail} exists but is inactive, using fallback`,
      );
      return FALLBACK_REP_ID;
    }

    // No existing rep — only auto-create when the Owner is in the
    // bmave.com Workspace. The calendar integration only authenticates
    // against bmave.com mailboxes, so a rep with someone@partner.com
    // would never have a usable calendar anyway.
    if (!normalizedEmail.endsWith("@bmave.com")) {
      console.warn(
        `[rep-lookup] Owner ${normalizedEmail} not @bmave.com, using fallback`,
      );
      return FALLBACK_REP_ID;
    }

    // Try to get a proper display name. If Zoho user ID is provided,
    // call the Users API; otherwise fall back to email-prefix.
    let fullName = normalizedEmail.split("@")[0];
    const zohoUserId = options.zohoUserId?.trim() || null;
    if (zohoUserId) {
      try {
        const user = await zohoApi.getUser(zohoUserId);
        const userRecord = user as
          | { full_name?: string; first_name?: string; last_name?: string }
          | null;
        const apiFullName = userRecord?.full_name?.trim();
        const composed =
          userRecord?.first_name && userRecord?.last_name
            ? `${userRecord.first_name.trim()} ${userRecord.last_name.trim()}`
            : null;
        fullName = apiFullName || composed || fullName;
      } catch (err) {
        console.warn(
          `[rep-lookup] Users API failed for ${zohoUserId}, using email prefix fallback:`,
          err,
        );
      }
    }

    const { data: newRep, error: insertErr } = await core
      .from("reps")
      .insert({
        name: fullName,
        email: normalizedEmail,
        calendar_email: normalizedEmail,
        role: "Blue Maven Franchise Development",
        zoho_user_id: zohoUserId,
        is_active: true,
      })
      .select("id")
      .single();

    if (insertErr || !newRep) {
      // Race condition: two webhooks for the same NEW Owner can collide
      // on the unique(email) constraint. Second one falls back; admin
      // reassigns the orphan candidate once the first rep row settles.
      console.error(
        `[rep-lookup] auto-create rep failed for ${normalizedEmail}:`,
        insertErr,
      );
      return FALLBACK_REP_ID;
    }

    console.log(
      `[rep-lookup] auto-created rep ${fullName} (${normalizedEmail}) → ${newRep.id}`,
    );
    return newRep.id as string;
  } catch (err) {
    console.error("[rep-lookup] resolution failed, using fallback:", err);
    return FALLBACK_REP_ID;
  }
}
