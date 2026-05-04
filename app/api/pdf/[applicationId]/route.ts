import "server-only";
import { NextResponse } from "next/server";
import { createFlightdeckClient } from "@/lib/flightdeck-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public redirect endpoint that turns a short application id into a
// fresh, short-lived signed URL on flightdeck's application-pdfs
// bucket. Exists because Zoho's URL fields cap at ~255 chars and the
// raw signed URL is ~600 — so we store this short link on the lead
// instead and resolve it on click.
//
// Security model: the application_id is an unguessable UUID v4. A
// caller would need to know an existing id to read a PDF. The signed
// URL we generate has a 1-hour TTL and only points at one file, so
// even a leak from the browser's address bar is short-lived and
// scope-limited. No additional auth — flightdeck's web app uses the
// stored long-lived URL on the row directly and doesn't go through
// this redirect.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — plenty for a click.

export async function GET(
  _request: Request,
  { params }: { params: { applicationId: string } },
) {
  const id = params.applicationId;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const flightdeck = createFlightdeckClient();

  const { data: row, error } = await flightdeck
    .from("candidate_applications")
    .select("pdf_filename")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[pdf-redirect] lookup failed", error);
    return NextResponse.json(
      { error: "Lookup failed" },
      { status: 500 },
    );
  }

  if (!row?.pdf_filename) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Storage path mirrors lib/upload-application-pdf.ts —
  // `applications/<filename>` inside the application-pdfs bucket.
  const path = `applications/${row.pdf_filename as string}`;

  const { data: signed, error: signErr } = await flightdeck.storage
    .from("application-pdfs")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    console.error(
      "[pdf-redirect] signed URL generation failed",
      signErr,
    );
    return NextResponse.json(
      { error: "Could not generate URL" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(signed.signedUrl, 302);
}
