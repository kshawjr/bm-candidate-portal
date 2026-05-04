import "server-only";
import { createFlightdeckClient } from "@/lib/flightdeck-client";

interface UploadResult {
  filename: string;
  signedUrl: string;
}

// Signed URL TTL. The lead may sit in "Application Submitted" for
// weeks before sales acts on it, so a too-short TTL makes the URL on
// the Zoho lead a dead link by the time anyone clicks. One year is
// the practical Supabase max for a signed URL — at that point the
// lead is stale anyway and a fresh URL can be generated from
// flightdeck on demand. Tradeoff vs. shorter rotation: a leaked URL
// is valid for the full year. The URL itself only lands in the Zoho
// lead and the flightdeck row, both internal-only.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;

/**
 * Upload an already-generated PDF to flightdeck's `application-pdfs`
 * bucket and return a long-lived signed URL.
 *
 * Path uses the candidate id + zoho lead id so collisions across
 * brands / re-submissions are unambiguous in the bucket listing.
 * `upsert: true` so a re-submission overwrites the prior PDF rather
 * than failing — flightdeck's `candidate_applications` table tracks
 * the history; the bucket holds only the latest.
 */
export async function uploadApplicationPdf(
  pdfBytes: Uint8Array,
  candidateId: string,
  zohoLeadId: string | null,
): Promise<UploadResult> {
  const supabase = createFlightdeckClient();
  const filename = `${candidateId}_${zohoLeadId ?? "no-lead"}_application.pdf`;
  const path = `applications/${filename}`;

  const { error: uploadErr } = await supabase.storage
    .from("application-pdfs")
    .upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadErr) {
    throw new Error(`PDF upload failed: ${uploadErr.message}`);
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from("application-pdfs")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    throw new Error(
      `Signed URL generation failed: ${signErr?.message ?? "unknown"}`,
    );
  }

  return {
    filename,
    signedUrl: signed.signedUrl,
  };
}
