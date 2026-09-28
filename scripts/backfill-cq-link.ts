/*
 * Backfill Zoho Leads' CQ_Link field with each candidate's short
 * re-engagement link: https://<brand portal host>/a/<portal token>
 *
 * New leads get CQ_Link from the zoho-lead-created webhook; this script
 * covers candidates created before that shipped.
 *
 * DRY RUN BY DEFAULT. Without --apply it only READS (Supabase + Zoho)
 * and prints what it would change. Nothing is written anywhere.
 *
 *   Dry run:  npm run backfill:cq-link
 *   Apply:    npm run backfill:cq-link -- --apply
 *
 * (Equivalent: npx tsx scripts/backfill-cq-link.ts [--apply])
 *
 * Reads env from .env.local (same as scripts/seed.ts):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY      (portal DB)
 *   NEXT_PUBLIC_BMAVE_CORE_URL, BMAVE_CORE_SERVICE_ROLE_KEY  (bmave-core)
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_API_DOMAIN (optional)
 *
 * Which leads: every candidates_in_portal row with a token whose
 * bmave-core candidate has a zoho_lead_id and a brand with a known
 * portal host. Leads whose CQ_Link already equals the target are
 * skipped. Writes go in small batches with a pause between them.
 *
 * Has its own tiny Zoho client instead of importing lib/zoho-api.ts,
 * because that module imports "server-only", which throws outside
 * Next.js.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import {
  PORTAL_HOST_BY_BRAND_SLUG,
  buildCqShortLink,
} from "../lib/portal-links";

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 10; // Zoho records per PUT (API max is 100)
const PAUSE_MS = 1500; // pause between batches
const PAGE_SIZE = 1000; // Supabase page size
const ID_CHUNK = 100; // ids per .in() / Zoho ?ids= lookup

// ---------- env + clients ----------

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[backfill-cq-link] missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const core = createClient(
  required("NEXT_PUBLIC_BMAVE_CORE_URL"),
  required("BMAVE_CORE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const app = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const ZOHO_API_DOMAIN =
  process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.com";

let zohoAccessToken: string | null = null;
let zohoTokenExpiresAt = 0;

async function getZohoToken(): Promise<string> {
  if (zohoAccessToken && Date.now() < zohoTokenExpiresAt) {
    return zohoAccessToken;
  }
  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: required("ZOHO_REFRESH_TOKEN"),
      client_id: required("ZOHO_CLIENT_ID"),
      client_secret: required("ZOHO_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token || !data.expires_in) {
    throw new Error(
      `Zoho token refresh failed: ${res.status} ${data.error ?? "unknown"}`,
    );
  }
  zohoAccessToken = data.access_token;
  zohoTokenExpiresAt = Date.now() + data.expires_in * 1000 - 60_000;
  return zohoAccessToken;
}

/** READ ONLY. Returns leadId → current CQ_Link (null if empty). Lead
 *  ids Zoho doesn't return (deleted / converted) are absent. */
async function fetchCurrentCqLinks(
  leadIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const token = await getZohoToken();
  const qs = `?ids=${leadIds.map(encodeURIComponent).join(",")}&fields=id,CQ_Link`;
  const res = await fetch(`${ZOHO_API_DOMAIN}/crm/v3/Leads${qs}`, {
    method: "GET",
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (res.status === 204) return out;
  if (!res.ok) {
    throw new Error(`Zoho GET Leads ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: Record<string, unknown>[] };
  for (const rec of body.data ?? []) {
    const v = rec.CQ_Link;
    out.set(String(rec.id), typeof v === "string" && v.length > 0 ? v : null);
  }
  return out;
}

/** WRITES to Zoho. Only called when --apply is passed. Returns
 *  per-record outcome keyed by lead id. */
async function writeCqLinks(
  rows: { leadId: string; target: string }[],
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>(); // null = success, string = error
  const token = await getZohoToken();
  const res = await fetch(`${ZOHO_API_DOMAIN}/crm/v3/Leads`, {
    method: "PUT",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: rows.map((r) => ({ id: r.leadId, CQ_Link: r.target })),
    }),
  });
  const text = await res.text();
  let parsed: {
    data?: {
      code?: string;
      status?: string;
      message?: string;
      details?: { id?: string };
    }[];
  } | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!parsed?.data) {
    for (const r of rows) {
      results.set(r.leadId, `HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return results;
  }
  // Zoho returns one entry per input record, in input order.
  parsed.data.forEach((entry, i) => {
    const leadId = rows[i]?.leadId ?? String(entry.details?.id ?? `#${i}`);
    results.set(
      leadId,
      entry.status === "success"
        ? null
        : `${entry.code ?? "ERROR"}: ${entry.message ?? "unknown"}`,
    );
  });
  return results;
}

// ---------- helpers ----------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface PortalRow {
  candidate_id: string;
  token: string;
}

interface Plan {
  leadId: string;
  brandSlug: string;
  current: string | null;
  target: string;
}

// ---------- main ----------

async function main() {
  console.log(
    `[backfill-cq-link] mode: ${APPLY ? "APPLY (will write to Zoho)" : "DRY RUN (no writes)"}`,
  );

  // 1. All portal rows with a token (portal DB), paged.
  const portalRows: PortalRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await app
      .from("candidates_in_portal")
      .select("candidate_id, token")
      .not("token", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`candidates_in_portal read: ${error.message}`);
    for (const r of data ?? []) {
      if (r.candidate_id && r.token) {
        portalRows.push({
          candidate_id: String(r.candidate_id),
          token: String(r.token),
        });
      }
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  // 2. Brand id → slug (bmave-core).
  const { data: brands, error: brandErr } = await core
    .from("brands")
    .select("id, slug");
  if (brandErr) throw new Error(`brands read: ${brandErr.message}`);
  const slugByBrandId = new Map<string, string>();
  for (const b of brands ?? []) slugByBrandId.set(String(b.id), String(b.slug));

  // 3. Candidate → zoho_lead_id + brand (bmave-core), chunked.
  const candById = new Map<
    string,
    { zoho_lead_id: string | null; brand_id: string | null }
  >();
  for (const ids of chunk(
    portalRows.map((r) => r.candidate_id),
    ID_CHUNK,
  )) {
    const { data, error } = await core
      .from("candidates")
      .select("id, zoho_lead_id, brand_id")
      .in("id", ids);
    if (error) throw new Error(`candidates read: ${error.message}`);
    for (const c of data ?? []) {
      candById.set(String(c.id), {
        zoho_lead_id: c.zoho_lead_id ? String(c.zoho_lead_id) : null,
        brand_id: c.brand_id ? String(c.brand_id) : null,
      });
    }
  }

  // 4. Compute targets.
  let skippedNoLead = 0;
  const skippedNoHost: string[] = [];
  const planned: Omit<Plan, "current">[] = [];
  for (const r of portalRows) {
    const c = candById.get(r.candidate_id);
    if (!c?.zoho_lead_id) {
      skippedNoLead++;
      continue;
    }
    const slug = c.brand_id ? slugByBrandId.get(c.brand_id) : undefined;
    const host = slug ? PORTAL_HOST_BY_BRAND_SLUG[slug] : undefined;
    if (!slug || !host) {
      skippedNoHost.push(`${c.zoho_lead_id} (brand ${slug ?? c.brand_id ?? "?"})`);
      continue;
    }
    planned.push({
      leadId: c.zoho_lead_id,
      brandSlug: slug,
      target: buildCqShortLink(host, r.token),
    });
  }

  // 5. Read current CQ_Link from Zoho (read only).
  const current = new Map<string, string | null>();
  for (const ids of chunk(
    planned.map((p) => p.leadId),
    ID_CHUNK,
  )) {
    const got = await fetchCurrentCqLinks(ids);
    got.forEach((v, k) => current.set(k, v));
    await sleep(300);
  }

  const notInZoho: string[] = [];
  let alreadyCorrect = 0;
  const toWrite: Plan[] = [];
  for (const p of planned) {
    if (!current.has(p.leadId)) {
      notInZoho.push(p.leadId);
      continue;
    }
    const cur = current.get(p.leadId) ?? null;
    if (cur === p.target) {
      alreadyCorrect++;
      continue;
    }
    toWrite.push({ ...p, current: cur });
  }

  // 6. Report.
  console.log("");
  console.table(
    toWrite.map((p) => ({
      lead_id: p.leadId,
      brand: p.brandSlug,
      current_cq_link: p.current ?? "(empty)",
      new_cq_link: p.target,
    })),
  );
  console.log("");
  console.log(`portal rows with token:          ${portalRows.length}`);
  console.log(`skipped — no zoho_lead_id:       ${skippedNoLead}`);
  console.log(`skipped — no portal host:        ${skippedNoHost.length}`);
  for (const s of skippedNoHost) console.log(`    ${s}`);
  console.log(`skipped — lead not found in Zoho: ${notInZoho.length}`);
  for (const s of notInZoho) console.log(`    ${s}`);
  console.log(`skipped — CQ_Link already correct: ${alreadyCorrect}`);
  console.log(`WOULD WRITE:                      ${toWrite.length}`);

  if (!APPLY) {
    console.log("");
    console.log("[backfill-cq-link] DRY RUN — nothing written. Re-run with --apply to write.");
    return;
  }

  // 7. Apply, in small batches.
  console.log("");
  console.log(`[backfill-cq-link] writing ${toWrite.length} leads in batches of ${BATCH_SIZE}...`);
  let ok = 0;
  const failures: { leadId: string; error: string }[] = [];
  const batches = chunk(toWrite, BATCH_SIZE);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      const results = await writeCqLinks(
        batch.map((p) => ({ leadId: p.leadId, target: p.target })),
      );
      for (const p of batch) {
        const err = results.has(p.leadId)
          ? results.get(p.leadId)
          : "no result returned for this record";
        if (err) failures.push({ leadId: p.leadId, error: err });
        else ok++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const p of batch) failures.push({ leadId: p.leadId, error: msg });
    }
    console.log(`  batch ${i + 1}/${batches.length} done (ok so far: ${ok}, failed so far: ${failures.length})`);
    if (i < batches.length - 1) await sleep(PAUSE_MS);
  }

  console.log("");
  console.log(`[backfill-cq-link] SUMMARY — success: ${ok}, failed: ${failures.length}`);
  for (const f of failures) console.log(`  FAILED ${f.leadId}: ${f.error}`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[backfill-cq-link] fatal:", err);
  process.exit(1);
});
