/*
 * Seed script for the Candidate Portal.
 *
 * Idempotent. Safe to re-run. Writes to two Supabase projects:
 *   - bmave-core:  portal_content rows per brand, plus dev test candidates
 *   - this app:    stops_config, steps_config, candidates_in_portal rows
 *
 * Source of truth: docs/design-prototypes/candidate-portal-design-v18.html
 *   (BRAND_MARKETING, STAGES, STAGE_CONTENT, STAGE_ICONS, STOP_STEPS)
 *
 * Run with:  npm run seed
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

// ---------- v18 seed constants ----------

const STAGES = [
  { key: "explore",    label: "Explore",    name: "Education & qualification", icon: "✨" },
  { key: "first_chat", label: "First chat", name: "Discovery call",            icon: "📞" },
  { key: "deep_dive",  label: "Deep dive",  name: "Education webinar",         icon: "🎥" },
  { key: "playbook",   label: "Playbook",   name: "FDD exploration",           icon: "📖" },
  { key: "verify",     label: "Verify",     name: "Verification",              icon: "✅" },
  { key: "visit",      label: "Visit",      name: "Discovery Day",             icon: "📍" },
  { key: "award",      label: "Welcome",    name: "Franchise award",           icon: "🏆" },
] as const;

const STAGE_CONTENT: Record<string, Record<string, string>> = {
  explore: {
    badge: "Current · Explore",
    headline: "Get to know us",
    body: "Two things in this first stage — a short brand tour and a light application so we get to know each other. Both save as you go.",
    button: "Open the tour →",
    meta: "About 15 minutes total",
    completedTitle: "Brand tour & application done",
    completedSub: "Stage 1 complete — you're officially in the process",
    lockedTitle: "Get to know us",
    lockedSub: "Brand tour + light application",
  },
  first_chat: {
    badge: "Current · First chat",
    headline: "Book your first chat",
    body: "30 minutes with our franchise team. No decks, no hard sell — just a real conversation about what you're looking for and whether we're a fit.",
    button: "Find a time →",
    meta: "Most candidates pick a weekday morning",
    completedTitle: "First chat complete",
    completedSub: "You talked with the team",
    lockedTitle: "First chat",
    lockedSub: "Your kickoff call with the team",
  },
  deep_dive: {
    badge: "Current · Deep dive",
    headline: "Time for the real deep dive",
    body: "An hour with our founder and a current franchisee. Live Tuesdays at 2pm ET, or watch on-demand whenever. Ask anything — that's the whole point.",
    button: "Register or watch →",
    meta: "Covers the model, support, unit economics, a day in the life",
    completedTitle: "Deep dive complete",
    completedSub: "You know the model inside and out",
    lockedTitle: "Education webinar",
    lockedSub: "Deep dive into the business",
  },
  playbook: {
    badge: "Current · The playbook",
    headline: "Under the hood",
    body: "The FDD looks scary but it's just our franchise in document form. We've broken it into readable sections — and we'll answer any question, no matter how small it feels.",
    button: "Start with section 1 →",
    meta: "23 sections · read in order or jump around · Q&A anytime",
    completedTitle: "FDD reviewed",
    completedSub: "All 23 sections, read and understood",
    lockedTitle: "FDD exploration",
    lockedSub: "The full franchise disclosure, unlocked",
  },
  verify: {
    badge: "Current · Verify",
    headline: "The verification round",
    body: "The formal bit — background checks, financial verification, and a few validation calls with current franchisees. Most of it happens quietly in the background. Your only real task: pick two or three franchisees to talk to.",
    button: "Start verification →",
    meta: "Background · Financial verification · Franchisee validation calls",
    completedTitle: "All checks cleared",
    completedSub: "You're fully verified on both sides",
    lockedTitle: "Verification",
    lockedSub: "Background, financial & franchisee validation checks",
  },
  visit: {
    badge: "Current · Discovery Day",
    headline: "Come see us in person",
    body: "Your day at HQ. Meet the whole team, see operations live, walk the path of a typical day. Lunch is on us. This is the confirmation step on both sides — everyone leaves sure.",
    button: "Plan your visit →",
    meta: "One day · usually a Tuesday · we cover travel",
    completedTitle: "Visit complete",
    completedSub: "You came, you saw, we're aligned",
    lockedTitle: "Discovery Day",
    lockedSub: "The in-person confirmation visit",
  },
  award: {
    badge: "Current · Welcome day",
    headline: "Ready to make it official?",
    body: "The last step — we sign the franchise agreement and you're one of us. Territory locked in, training scheduled, doors ahead.",
    button: "Review the agreement →",
    meta: "Territory · Franchise fee · First 90 days",
    completedTitle: "You're a franchisee",
    completedSub: "Welcome to the family",
    lockedTitle: "Franchise award",
    lockedSub: "The official welcome — and the beginning",
  },
};

type ContentType = "slides" | "static" | "application" | "schedule" | "video" | "document" | "checklist";

const STOP_STEPS: Record<string, Array<{ key: string; label: string; type: ContentType; desc: string }>> = {
  explore: [
    { key: "tour",     label: "Brand tour",         type: "slides",      desc: "A short walk through who we are" },
    { key: "app",      label: "Light application",  type: "application", desc: "Quick questions so we can get to know you" },
  ],
  first_chat: [
    { key: "prep",     label: "Before the call",    type: "static",      desc: "What to expect, who you'll meet" },
    { key: "schedule", label: "Pick a time",        type: "schedule",    desc: "Book a 30-minute call" },
    { key: "recap",    label: "Call notes",         type: "static",      desc: "Summary + next steps (available after the call)" },
  ],
  deep_dive: [
    { key: "register", label: "Register",           type: "schedule",    desc: "Tuesday 2pm ET, or watch on demand" },
    { key: "webinar",  label: "The webinar",        type: "video",       desc: "One hour with the founder" },
    { key: "qa",       label: "Ask anything",       type: "static",      desc: "Follow-up questions, answered within 24 hours" },
  ],
  playbook: [
    { key: "intro",    label: "How to read the FDD", type: "static",     desc: "A quick primer on the document" },
    { key: "document", label: "The FDD",             type: "document",   desc: "23 sections, broken up for readability" },
    { key: "questions", label: "Your questions",     type: "checklist",  desc: "Mark what you want clarity on" },
  ],
  verify: [
    { key: "background", label: "Background check", type: "checklist",   desc: "Consent form + ID verification" },
    { key: "financial",  label: "Financial review", type: "checklist",   desc: "Upload or connect to verify" },
    { key: "validation", label: "Validation calls", type: "static",      desc: "Roster of franchisees to call" },
  ],
  visit: [
    { key: "invite",   label: "Your invitation",    type: "static",      desc: "Date, time, and logistics" },
    { key: "travel",   label: "Travel + stay",      type: "static",      desc: "Flights, hotel, everything handled" },
    { key: "agenda",   label: "The agenda",         type: "static",      desc: "Hour by hour for your day at HQ" },
  ],
  award: [
    { key: "review",   label: "Review the agreement", type: "document",  desc: "The final franchise agreement" },
    { key: "sign",     label: "Sign",                 type: "static",    desc: "E-signature when you're ready" },
    { key: "welcome",  label: "Welcome!",             type: "static",    desc: "First 90 days, training schedule, your team" },
  ],
};

type BrandCode = "ht" | "ct";
const SLUG_TO_CODE: Record<string, BrandCode> = {
  "hounds-town-usa": "ht",
  "cruisin-tikis": "ct",
};

interface BrandMarketing {
  eyebrow: string;
  title: string;
  body: string;
  stats: Array<{ num: string; label: string }>;
  concepts: Array<{ icon: string; title: string; body: string }>;
  leaderName: string;
  leaderRole: string;
  leaderEmail: string;
  brandMarkHtml: string;
}

const BRAND_MARKETING: Record<BrandCode, BrandMarketing> = {
  ht: {
    eyebrow: "Franchise Ownership Discovery Portal",
    title: "Where every dog is <em>family.</em><br>Are you ready to lead the pack?",
    body: "America's most trusted cage-free dog daycare. A limited number of metro markets remain open for the right operators. This portal is your personal guide through every stage of ownership with Hounds Town USA.",
    stats: [
      { num: "100+",  label: "Open locations" },
      { num: "$1.2M", label: "Avg unit volume" },
      { num: "$2.4M", label: "Top performer" },
      { num: "20+",   label: "Years proven" },
    ],
    concepts: [
      { icon: "🐾", title: "Explore", body: "Understand the market opportunity, our pack-based model, and what daily ownership actually looks like." },
      { icon: "💬", title: "Connect", body: "Speak with our development team, validate with existing franchisees, and get real answers from real owners." },
      { icon: "🎯", title: "Decide",  body: "Meet the full support team on Discovery Day, finalize your territory, and complete the ownership process with clarity." },
    ],
    leaderName: "Zac Celaya",
    leaderRole: "Blue Maven Franchise Development",
    leaderEmail: "hounds@bmave.com",
    brandMarkHtml: "Hounds Town",
  },
  ct: {
    eyebrow: "Franchise Ownership Discovery Portal",
    title: "The Water <em>Is Calling.</em><br>Are You Built for This?",
    body: "America's #1 floating tiki bar franchise. A limited number of waterfront markets remain open for the right investors. This portal is your personal guide through every stage of evaluating ownership with Cruisin' Tikis.",
    stats: [
      { num: "44+",    label: "Open locations" },
      { num: "$99K",   label: "Avg rev/vessel" },
      { num: "$265K+", label: "Top performer" },
      { num: "62K+",   label: "Five-star reviews" },
    ],
    concepts: [
      { icon: "🌊", title: "Explore", body: "Understand the market opportunity, the vessel-based business model, and what daily ownership actually looks like." },
      { icon: "💬", title: "Connect", body: "Speak with our development team, validate with existing franchisees, and have a direct conversation with our Co-CEOs." },
      { icon: "🎯", title: "Decide",  body: "Meet the full support team on Confirmation Day, finalize your territory, and complete the ownership process with clarity." },
    ],
    leaderName: "Zac Celaya",
    leaderRole: "Blue Maven Franchise Development",
    leaderEmail: "tourscale@bmave.com",
    brandMarkHtml: "Cruisin' Tikis",
  },
};

// Real static body copy for the proof-of-life step (first_chat/prep).
// Other static steps ship with empty body — content authoring is a later PR.
const STATIC_BODIES: Partial<Record<BrandCode, Partial<Record<string, Partial<Record<string, string>>>>>> = {
  ht: {
    first_chat: {
      prep: `Thanks for booking your first chat. Here's what to expect so nothing feels like a cold open.

This is a 30-minute conversation, not a pitch. You'll meet Zac from our franchise development team. No slide deck. No hard sell. The goal is to hear what you're looking for and share honestly whether Hounds Town is likely to be a fit.

Come with whatever questions are top of mind — about the pack model, the economics, what running a location actually looks like day-to-day. We'll also ask you about your timeline, what markets you're eyeing, and what "good" looks like for you.

A few minutes before the call, we'll email you a short prep doc with the calendar link and a one-page summary of how the process works from here.`,
    },
  },
  ct: {
    first_chat: {
      prep: `Thanks for booking your first chat. Here's the shape of it so you can come in relaxed.

This is a 30-minute conversation, not a sales call. You'll meet Zac from Blue Maven and, depending on the day, a member of the Cruisin' Tikis leadership team. We'll walk you through how the Cruisin' Tikis franchise actually works and answer whatever's on your mind.

Come with questions — about the vessel-based model, the licensing we handle for you, Captain school, what your first season realistically looks like. We'll also want to hear about your timeline, the waterfront markets you're thinking about, and what a win looks like for you.

A few minutes before the call we'll email you the calendar link and a short prep doc so you're not scrambling at the top of the hour.`,
    },
  },
};

// Stable dev tokens. One per brand.
const DEV_TOKENS: Record<BrandCode, { token: string; firstName: string; email: string }> = {
  ht: { token: "test-token-123", firstName: "Jamie", email: "test-candidate-ht@example.com" },
  ct: { token: "test-token-456", firstName: "Jamie", email: "test-candidate-ct@example.com" },
};

// Per-brand typography — writes to bmave-core.brands.font_overrides.
// Font families must match what we load via next/font in app/portal/[token]/page.tsx.
interface FontOverrides {
  heading_font: string;
  heading_weight: string;
  body_font: string;
  heading_transform: "none" | "uppercase";
}
// Horizontal logo URLs (public Supabase storage). Vertical + mark variants
// don't exist yet; code falls back to the brand name in the heading font when
// no logo_url is set.
const LOGO_URL: Record<BrandCode, string> = {
  ht: "https://dcnbgzxfhsrgmcfwydyy.supabase.co/storage/v1/object/public/brand-assets/hounds-town-usa/houndstown-horizontal.png",
  ct: "https://dcnbgzxfhsrgmcfwydyy.supabase.co/storage/v1/object/public/brand-assets/cruisin-tikis/Cruisin%20Tikis_Horizontal.png",
};

// Base theming keys (primary/secondary/accent/dark/soft) + full swatch list
// under colors.palette. Emitted per-brand as --brand-palette-* CSS vars.
interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  dark: string;
  soft: string;
  palette: Record<string, string>;
}
const BRAND_COLORS: Record<BrandCode, BrandColors> = {
  ht: {
    primary: "#008aba",
    secondary: "#bddc04",
    accent: "#ff6c2f",
    dark: "#266783",
    soft: "#ace3ef",
    palette: {
      blue: "#008aba",
      green: "#bddc04",
      orange: "#ff6c2f",
      brown: "#635242",
      dark_teal: "#266783",
      light_blue: "#ace3ef",
      cyan: "#5ec8e5",
      bright_blue: "#32b8de",
      deep_blue: "#009ecc",
      lavender: "#dac5dc",
      white: "#ffffff",
      black: "#000000",
    },
  },
  ct: {
    primary: "#f86e4f",
    secondary: "#213976",
    accent: "#1edee4",
    dark: "#213976",
    soft: "#35acef",
    palette: {
      cyan: "#1edee4",
      bright_blue: "#35acef",
      navy: "#213976",
      coral: "#f86e4f",
      black: "#000000",
      white: "#ffffff",
    },
  },
};

const FONT_OVERRIDES: Record<BrandCode, FontOverrides> = {
  ht: {
    heading_font: "Baloo 2",
    heading_weight: "700",
    body_font: "Nunito Sans",
    heading_transform: "none",
  },
  ct: {
    heading_font: "Montserrat",
    heading_weight: "700",
    body_font: "Montserrat",
    heading_transform: "none",
  },
};

// ---------- env + clients ----------

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[seed] missing env var: ${name}`);
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

// ---------- seeders ----------

async function seedBrandInfra(brandId: string, code: BrandCode) {
  const { error } = await core
    .from("brands")
    .update({
      logo_url: LOGO_URL[code],
      colors: BRAND_COLORS[code],
      font_overrides: FONT_OVERRIDES[code],
    })
    .eq("id", brandId);
  if (error) throw new Error(`brands update failed: ${error.message}`);
  const paletteCount = Object.keys(BRAND_COLORS[code].palette).length;
  console.log(
    `[seed] brands -> ${code} (logo, ${paletteCount}-swatch palette, ${FONT_OVERRIDES[code].heading_font} / ${FONT_OVERRIDES[code].body_font})`,
  );
}

async function seedPortalContent(brandId: string, code: BrandCode) {
  const m = BRAND_MARKETING[code];
  type Row = { brand_id: string; content_key: string; content_type: string; title?: string; body?: string; data?: unknown };

  const rows: Row[] = [
    { brand_id: brandId, content_key: "hero_eyebrow",    content_type: "text",     body: m.eyebrow },
    { brand_id: brandId, content_key: "hero_title",      content_type: "markdown", body: m.title },
    { brand_id: brandId, content_key: "hero_body",       content_type: "text",     body: m.body },
    { brand_id: brandId, content_key: "hero_stats",      content_type: "json",     data: m.stats },
    { brand_id: brandId, content_key: "concepts",        content_type: "json",     data: m.concepts },
    { brand_id: brandId, content_key: "leader_name",     content_type: "text",     body: m.leaderName },
    { brand_id: brandId, content_key: "leader_role",     content_type: "text",     body: m.leaderRole },
    { brand_id: brandId, content_key: "leader_email",    content_type: "text",     body: m.leaderEmail },
    { brand_id: brandId, content_key: "brand_mark_html", content_type: "markdown", body: m.brandMarkHtml },
  ];

  const { error } = await core.from("portal_content").upsert(rows, { onConflict: "brand_id,content_key" });
  if (error) throw new Error(`portal_content upsert failed: ${error.message}`);
  console.log(`[seed] portal_content: ${rows.length} rows for ${code}`);
}

async function seedStops(brandId: string) {
  const rows = STAGES.map((stage, i) => ({
    brand_id: brandId,
    stop_key: stage.key,
    position: i,
    label: stage.label,
    name: stage.name,
    icon: stage.icon,
    content: STAGE_CONTENT[stage.key] ?? {},
  }));

  const { error } = await app.from("stops_config").upsert(rows, { onConflict: "brand_id,stop_key" });
  if (error) throw new Error(`stops_config upsert failed: ${error.message}`);
  console.log(`[seed] stops_config: ${rows.length} rows for brand ${brandId}`);
}

async function seedSteps(brandId: string, code: BrandCode) {
  type Row = {
    brand_id: string;
    stop_key: string;
    position: number;
    step_key: string;
    label: string;
    description: string;
    content_type: ContentType;
    config: Record<string, unknown>;
  };
  const rows: Row[] = [];
  for (const [stopKey, steps] of Object.entries(STOP_STEPS)) {
    steps.forEach((step, i) => {
      const body = STATIC_BODIES[code]?.[stopKey]?.[step.key];
      rows.push({
        brand_id: brandId,
        stop_key: stopKey,
        position: i,
        step_key: step.key,
        label: step.label,
        description: step.desc,
        content_type: step.type,
        config: body ? { body } : {},
      });
    });
  }

  const { error } = await app.from("steps_config").upsert(rows, { onConflict: "brand_id,stop_key,step_key" });
  if (error) throw new Error(`steps_config upsert failed: ${error.message}`);
  console.log(`[seed] steps_config: ${rows.length} rows for ${code}`);
}

async function seedDevCandidate(brandId: string, code: BrandCode) {
  const { token, firstName, email } = DEV_TOKENS[code];

  // Upsert candidate identity in bmave-core
  const { data: candidate, error: cErr } = await core
    .from("candidates")
    .upsert(
      {
        email,
        first_name: firstName,
        last_name: "Rivera",
        brand_id: brandId,
        lifecycle_stage: "candidate",
      },
      { onConflict: "email" },
    )
    .select("id")
    .single();
  if (cErr || !candidate) throw new Error(`candidates upsert failed: ${cErr?.message}`);

  // Look up any existing portal row for this token (idempotent safeguard)
  const { data: existing } = await app
    .from("candidates_in_portal")
    .select("id, current_stop, current_step")
    .eq("token", token)
    .maybeSingle();

  const row = {
    candidate_id: candidate.id,
    token,
    // Land the dev token on First chat / prep so the static renderer is exercised.
    current_stop: existing?.current_stop ?? 1,
    current_step: existing?.current_step ?? 0,
  };

  const { error: pErr } = await app
    .from("candidates_in_portal")
    .upsert(row, { onConflict: "token" });
  if (pErr) throw new Error(`candidates_in_portal upsert failed: ${pErr.message}`);

  console.log(`[seed] dev candidate: ${token} -> ${firstName} (${code})`);
}

// ---------- main ----------

async function main() {
  const { data: brands, error } = await core.from("brands").select("id, slug, name");
  if (error) throw new Error(`brands query failed: ${error.message}`);
  if (!brands?.length) {
    console.error("[seed] no brands in bmave-core.brands — seed Hounds Town USA + Cruisin' Tikis first.");
    process.exit(1);
  }

  for (const brand of brands) {
    const code = SLUG_TO_CODE[brand.slug];
    if (!code) {
      console.warn(`[seed] skipping unknown slug "${brand.slug}" (${brand.name})`);
      continue;
    }
    console.log(`[seed] -> ${brand.name} (${code})`);
    await seedBrandInfra(brand.id, code);
    await seedPortalContent(brand.id, code);
    await seedStops(brand.id);
    await seedSteps(brand.id, code);
    await seedDevCandidate(brand.id, code);
  }

  console.log("[seed] done");
}

main().catch((e) => {
  console.error("[seed] failed:", e);
  process.exit(1);
});
