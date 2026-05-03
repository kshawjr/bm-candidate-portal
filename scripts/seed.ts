/*
 * Seed script for the Candidate Portal.
 *
 * Idempotent. Safe to re-run. Writes to two Supabase projects:
 *   - bmave-core:  portal_content rows per brand, plus dev test candidates
 *   - this app:    chapters_config, steps_config, candidates_in_portal rows
 *
 * Source of truth: docs/design-prototypes/candidate-portal-design-v18.html
 *   (BRAND_MARKETING, STAGES, STAGE_CONTENT, STAGE_ICONS, CHAPTER_STEPS)
 *
 * Run with:  npm run seed
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

// ---------- v18 seed constants ----------

// label = warm sidebar label (user-facing, shown in the chapters list)
// name  = professional phrasing shown in the step strip header ("CHAPTER 2 · DISCOVERY CALL")
const STAGES = [
  { key: "explore",    label: "Get to know us",      name: "Education & qualification", icon: "✨" },
  { key: "first_chat", label: "Say hi",              name: "Discovery call",            icon: "📞" },
  { key: "deep_dive",  label: "Learn the details",   name: "Education webinar",         icon: "🎥" },
  { key: "playbook",   label: "Read the fine print", name: "FDD exploration",           icon: "📖" },
  { key: "verify",     label: "Due diligence",       name: "Verification",              icon: "✅" },
  { key: "visit",      label: "Come see us",         name: "Discovery Day",             icon: "📍" },
  { key: "award",      label: "Officially yours",    name: "Franchise award",           icon: "🏆" },
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
    body: "60 minutes with our franchise team. We'll walk through a short deck together — but mostly it's a real conversation about what you're looking for and whether we're a fit.",
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

const CHAPTER_STEPS: Record<string, Array<{ key: string; label: string; type: ContentType; desc: string }>> = {
  explore: [
    { key: "tour",     label: "Brand tour",         type: "slides",      desc: "A short walk through who we are" },
    { key: "app",      label: "Light application",  type: "application", desc: "Quick questions so we can get to know you" },
  ],
  // PR 38: Chapter 2 collapses to a single step (the schedule grid). The
  // pre-call prep content moved into Chapter 2's intro popup + banner;
  // the brand-level transition video covers the gear-shift moment.
  first_chat: [
    { key: "book",     label: "Book your call",     type: "schedule",    desc: "Pick a time that works — Google Meet, 60 minutes" },
  ],
  // PR 44: deep_dive intentionally has no steps. After Chapter 2's
  // booking, current_chapter advances to 2 (deep_dive) and the portal
  // renders YoureCurrentScreen because the chapter has zero active
  // steps. Real Chapter 3 content lands in a future PR; meanwhile the
  // candidate sees a holding card. The companion migration archives
  // any deep_dive steps existing brands picked up from earlier seeds.
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

// Conversational brand name used in candidate-facing copy + Google
// Calendar event titles. null means the brand's existing `name` is
// already short enough (e.g., "Cruisin' Tikis").
const BRAND_SHORT_NAME: Record<BrandCode, string | null> = {
  ht: "Hounds Town",
  ct: null,
};

interface StatItem {
  num: string;
  label: string;
}

interface BrandMarketing {
  eyebrow: string;
  title: string;
  body: string;
  stats: StatItem[];
  concepts: Array<{ icon: string; title: string; body: string }>;
  leaderName: string;
  leaderRole: string;
  leaderEmail: string;
  brandMarkHtml: string;
  // Chapter 1 hero strip — 4 larger stats, visible only when the candidate is
  // on Chapter 1 (Explore).
  heroStats: [StatItem, StatItem, StatItem, StatItem];
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
    leaderName: "Kevin Shaw",
    leaderRole: "Blue Maven Franchise Development",
    leaderEmail: "hounds@bmave.com",
    brandMarkHtml: "Hounds Town",
    heroStats: [
      { num: "150+", label: "franchises" },
      { num: "80+",  label: "owners" },
      { num: "12",   label: "states" },
      { num: "20+",  label: "years proven" },
    ],
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
    leaderName: "Kevin Shaw",
    leaderRole: "Blue Maven Franchise Development",
    leaderEmail: "tourscale@bmave.com",
    brandMarkHtml: "Cruisin' Tikis",
    heroStats: [
      { num: "44+",    label: "locations" },
      { num: "$99K",   label: "avg rev/vessel" },
      { num: "$265K",  label: "top performer" },
      { num: "62K+",   label: "5-star reviews" },
    ],
  },
};

// Content cards rendered below step content. Only Chapter 1 Step 1 (brand tour)
// gets cards in PR 8; every other step's content_cards column stays [].
// Card schema: see components/content-cards/types.ts.
type SeedContentCard = Record<string, unknown>;
const BRAND_TOUR_CONTENT_CARDS: Record<BrandCode, SeedContentCard[]> = {
  ht: [
    {
      type: "fact",
      headline: "70% of US households have at least one pet",
      body: "Pet care is a $151.9B industry growing to $250B by 2030.",
      source: "APPA / Morgan Stanley Research",
    },
    {
      type: "personas",
      items: [
        {
          name: "Passionate Pet Parents",
          photo_url: "https://placehold.co/320x320/008aba/ffffff?text=Pet+Parents",
          caption: "Dog-first households looking for a trusted second home",
        },
        {
          name: "Working Professionals",
          photo_url: "https://placehold.co/320x320/008aba/ffffff?text=Professionals",
          caption: "Dual-income families who need weekday daycare",
        },
        {
          name: "Frequent Travelers",
          photo_url: "https://placehold.co/320x320/008aba/ffffff?text=Travelers",
          caption: "Repeat boarders who come back every trip",
        },
      ],
    },
    {
      type: "quote",
      author: "Rob Flanagan",
      role: "CEO, Hounds Town USA",
      body: "There is something magical about the passion and vision a founder brings to the table — and we've carried that through to every single location we award.",
      photo_url: "https://placehold.co/200x200/266783/ffffff?text=RF",
    },
    {
      type: "awards",
      items: [
        { name: "Franchise 500", year: "2025" },
        { name: "Inc. 5000", year: "2025" },
        { name: "IFA Emerging Franchisor", year: "2025" },
        { name: "FBR Best in Category", year: "2025" },
      ],
    },
  ],
  ct: [
    {
      type: "fact",
      headline: "$99K+ avg revenue per vessel",
      body: "Our top performers are doing $265K in a single season.",
    },
    {
      type: "personas",
      items: [
        {
          name: "Couples & Date Night",
          photo_url: "https://placehold.co/320x320/f86e4f/ffffff?text=Date+Night",
          caption: "Two-hour sunset cruises are our highest-margin product",
        },
        {
          name: "Bachelorette / Bachelor Parties",
          photo_url: "https://placehold.co/320x320/f86e4f/ffffff?text=Parties",
          caption: "Group bookings that fill midweek slots and lift tips",
        },
        {
          name: "Corporate Events",
          photo_url: "https://placehold.co/320x320/f86e4f/ffffff?text=Corporate",
          caption: "Team outings with predictable repeat business",
        },
      ],
    },
    {
      type: "fact",
      headline: "62,000+ five-star reviews",
      body: "Customers don't just try Cruisin' Tikis — they come back with friends.",
    },
    {
      type: "photo",
      image_url: "https://placehold.co/1280x720/1edee4/213976?text=Fleet+in+action+%C2%B7+Tampa+Bay",
      caption: "The fleet in action · Tampa Bay",
    },
  ],
};

// Real static body copy for static-type steps. Other static steps ship
// with empty body — content authoring is a later PR.
const STATIC_BODIES: Partial<Record<BrandCode, Partial<Record<string, Partial<Record<string, string>>>>>> = {};

// Brand-tour placeholder slides for the explore/tour step. Real slides will be
// Canva PNGs uploaded to Supabase Storage; these placehold.co URLs let the
// slides renderer exercise until then. Hex in the URL is the brand's primary
// color (no leading #).
interface Slide {
  id: string;
  image_url: string;
  alt: string;
  caption: string | null;
}
function placeholderSlides(brandName: string, hexNoHash: string, count = 5): Slide[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const text = encodeURIComponent(`${brandName} Slide ${n}`);
    return {
      id: `slide-${n}`,
      image_url: `https://placehold.co/1280x720/${hexNoHash}/ffffff?text=${text}`,
      alt: `${brandName} brand tour slide ${n}`,
      caption: null,
    };
  });
}
const BRAND_TOUR_SLIDES: Record<BrandCode, Slide[]> = {
  ht: placeholderSlides("Hounds Town", "008aba"),
  ct: placeholderSlides("Cruisin Tikis", "f86e4f"),
};

// Stable dev tokens. One per brand. PR 37 added prefilledZip — HT seeds a
// real ZIP so the application location step skips the cold flow; CT leaves
// it null so the cold-input flow stays exercised. PR 42 added
// prefilledPhone with realistic-looking 555 numbers so the application's
// phone field exercises the prefill UI on both brands.
const DEV_TOKENS: Record<
  BrandCode,
  {
    token: string;
    firstName: string;
    email: string;
    prefilledZip: string | null;
    prefilledPhone: string | null;
  }
> = {
  ht: {
    token: "test-token-123",
    firstName: "Jamie",
    email: "test-candidate-ht@example.com",
    prefilledZip: "11237",
    prefilledPhone: "919-555-0123",
  },
  ct: {
    token: "test-token-456",
    firstName: "Jamie",
    email: "test-candidate-ct@example.com",
    prefilledZip: null,
    prefilledPhone: "305-555-0456",
  },
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
  const update: Record<string, unknown> = {
    logo_url: LOGO_URL[code],
    colors: BRAND_COLORS[code],
    font_overrides: FONT_OVERRIDES[code],
  };
  // brands.short_name is nullable; only populate for brands whose full
  // name needs shortening. Falls back to `name` in the app when null.
  const shortName = BRAND_SHORT_NAME[code];
  if (shortName !== null) {
    update.short_name = shortName;
  }
  const { error } = await core.from("brands").update(update).eq("id", brandId);
  if (error) {
    // If the migration hasn't been run yet, short_name won't exist. Give
    // a helpful hint instead of cryptic PG.
    if (/short_name/.test(error.message)) {
      throw new Error(
        `brands update failed (did you run 20260421_brands_short_name_bmave_core.sql?): ${error.message}`,
      );
    }
    throw new Error(`brands update failed: ${error.message}`);
  }
  const paletteCount = Object.keys(BRAND_COLORS[code].palette).length;
  console.log(
    `[seed] brands -> ${code} (logo, ${paletteCount}-swatch palette, ${FONT_OVERRIDES[code].heading_font} / ${FONT_OVERRIDES[code].body_font}${shortName ? `, short_name: "${shortName}"` : ""})`,
  );
}

/**
 * Seed the single demo rep — Kevin, kevin@bmave.com — and return its id so
 * test candidates can be assigned to it. Idempotent: reruns find the row
 * by email and return its id without touching anything else. When real
 * reps arrive this is replaced by a proper rep admin UI + Zoho sync.
 */
async function seedDemoRep(): Promise<string> {
  const demoEmail = "kevin@bmave.com";

  const { data: existing, error: readErr } = await core
    .from("reps")
    .select("id")
    .eq("email", demoEmail)
    .maybeSingle();
  if (readErr) {
    throw new Error(
      `reps read failed (did you run 20260421_reps_bmave_core.sql?): ${readErr.message}`,
    );
  }
  if (existing?.id) {
    console.log(`[seed] reps: demo rep already exists (${demoEmail})`);
    return existing.id as string;
  }

  const { data: inserted, error: insErr } = await core
    .from("reps")
    .insert({
      name: "Kevin Shaw",
      email: demoEmail,
      calendar_email: demoEmail,
      role: "Blue Maven Franchise Development",
      is_active: true,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    throw new Error(`reps insert failed: ${insErr?.message}`);
  }
  console.log(`[seed] reps: created demo rep (${demoEmail})`);
  return inserted.id as string;
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

  // Flat stat keys for the Chapter 1 hero strip (4 stats). The sidebar
  // "By the numbers" card was replaced by a context-aware journey card in
  // PR 8 — its sidebar_stat_* keys are no longer seeded. Existing rows on
  // brands that had them will remain (upsert only adds/updates, doesn't
  // delete), but they're simply unused.
  m.heroStats.forEach((s, i) => {
    const n = i + 1;
    rows.push({ brand_id: brandId, content_key: `hero_stat_${n}_num`,   content_type: "text", body: s.num });
    rows.push({ brand_id: brandId, content_key: `hero_stat_${n}_label`, content_type: "text", body: s.label });
  });

  const { error } = await core.from("portal_content").upsert(rows, { onConflict: "brand_id,content_key" });
  if (error) throw new Error(`portal_content upsert failed: ${error.message}`);
  console.log(`[seed] portal_content: ${rows.length} rows for ${code}`);
}

async function seedChapters(brandId: string, brandSlug: string) {
  // As of PR 15, admins manage chapters via /admin/structure. Seed the default
  // 7-chapter structure only when the brand has never had chapters before. On
  // re-runs against an existing brand, skip so admin edits aren't clobbered.
  const { data: existing, error: readErr } = await app
    .from("chapters_config")
    .select("id")
    .eq("brand_id", brandId)
    .limit(1);
  if (readErr) throw new Error(`chapters_config probe failed: ${readErr.message}`);
  if (existing && existing.length > 0) {
    console.log(
      `[seed] chapters_config: ${brandSlug} already has chapters, skipping structure seed`,
    );
    return;
  }

  const rows = STAGES.map((stage, i) => ({
    brand_id: brandId,
    chapter_key: stage.key,
    position: i,
    label: stage.label,
    name: stage.name,
    icon: stage.icon,
    content: STAGE_CONTENT[stage.key] ?? {},
  }));

  const { error } = await app.from("chapters_config").insert(rows);
  if (error) throw new Error(`chapters_config insert failed: ${error.message}`);
  console.log(`[seed] chapters_config: ${rows.length} rows for brand ${brandId}`);
}

async function seedSteps(brandId: string, code: BrandCode) {
  // Same rationale as seedChapters: admin owns step structure once it exists.
  // Skip the seed when the brand already has any steps defined.
  const { data: existingSteps, error: readErr } = await app
    .from("steps_config")
    .select("id")
    .eq("brand_id", brandId)
    .limit(1);
  if (readErr) throw new Error(`steps_config probe failed: ${readErr.message}`);
  if (existingSteps && existingSteps.length > 0) {
    console.log(
      `[seed] steps_config: ${code} already has steps, skipping structure seed`,
    );
    return;
  }

  type Row = {
    brand_id: string;
    chapter_key: string;
    position: number;
    step_key: string;
    label: string;
    description: string;
    content_type: ContentType;
    config: Record<string, unknown>;
    content_cards: SeedContentCard[];
  };
  const rows: Row[] = [];
  for (const [chapterKey, steps] of Object.entries(CHAPTER_STEPS)) {
    steps.forEach((step, i) => {
      const body = STATIC_BODIES[code]?.[chapterKey]?.[step.key];
      const config: Record<string, unknown> = {};
      if (body) config.body = body;
      if (chapterKey === "explore" && step.key === "tour") {
        config.slides = BRAND_TOUR_SLIDES[code];
      }
      if (chapterKey === "first_chat" && step.key === "hello") {
        config.source = "youtube";
        config.url = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
        config.title = "A quick hello before we chat";
        config.body =
          "30 seconds on who we are and what to expect on the call.";
        config.cta_label = "Book my call →";
      }
      if (chapterKey === "first_chat" && step.key === "book") {
        config.duration_minutes = 60;
        config.days_ahead = 14;
        config.start_hour = 9;
        config.end_hour = 17;
        config.timezone = "America/New_York";
        config.buffer_minutes = 0;
        config.body =
          "A real conversation with your franchise growth leader. No pressure — just a chat about what you're looking for.";
        config.event_label = "Discovery Call";
        config.working_days = [1, 2, 3, 4, 5];
        config.min_notice_hours = 24;
      }
      // Only Chapter 1 Step 1 (explore/tour) ships with content cards in PR 8.
      // Every other step gets [] so the strip renders nothing.
      const cards: SeedContentCard[] =
        chapterKey === "explore" && step.key === "tour"
          ? BRAND_TOUR_CONTENT_CARDS[code]
          : [];
      rows.push({
        brand_id: brandId,
        chapter_key: chapterKey,
        position: i,
        step_key: step.key,
        label: step.label,
        description: step.desc,
        content_type: step.type,
        config,
        content_cards: cards,
      });
    });
  }

  const { error } = await app.from("steps_config").insert(rows);
  if (error) throw new Error(`steps_config insert failed: ${error.message}`);
  console.log(`[seed] steps_config: ${rows.length} rows for ${code}`);
}


/**
 * PR 16 polish: ensure every schedule-type step has the config fields
 * introduced across the polish passes — event_label, working_days,
 * min_notice_hours — so existing seeded steps (from before these
 * defaults landed) behave sensibly. Only fills missing fields; admin
 * edits are preserved. Safe to re-run.
 */
async function backfillScheduleConfigDefaults() {
  const { data: steps, error } = await app
    .from("steps_config")
    .select("id, config")
    .eq("content_type", "schedule");
  if (error) {
    throw new Error(`steps_config probe failed: ${error.message}`);
  }
  if (!steps || steps.length === 0) return;

  let updated = 0;
  for (const step of steps) {
    const config =
      step.config && typeof step.config === "object" && !Array.isArray(step.config)
        ? (step.config as Record<string, unknown>)
        : {};
    const next: Record<string, unknown> = { ...config };
    let changed = false;

    const existingLabel =
      typeof config.event_label === "string" ? config.event_label.trim() : "";
    if (existingLabel.length === 0) {
      next.event_label = "Discovery Call";
      changed = true;
    }
    const hasWorkingDays =
      Array.isArray(config.working_days) && config.working_days.length > 0;
    if (!hasWorkingDays) {
      next.working_days = [1, 2, 3, 4, 5];
      changed = true;
    }
    if (typeof config.min_notice_hours !== "number") {
      next.min_notice_hours = 24;
      changed = true;
    }

    if (!changed) continue;

    const { error: upErr } = await app
      .from("steps_config")
      .update({ config: next })
      .eq("id", step.id);
    if (upErr) {
      throw new Error(`steps_config update failed: ${upErr.message}`);
    }
    updated += 1;
  }
  if (updated > 0) {
    console.log(
      `[seed] schedule config defaults: backfilled ${updated} step${updated === 1 ? "" : "s"}`,
    );
  }
}

/**
 * PR 34: per-chapter transition videos. Replaces the brand-level welcome
 * popup seed (PR 31). Seeds Chapter 1 for each brand so the explore chapter
 * starts with a video; other chapters stay unconfigured so admins see the
 * "no video configured" state in /admin/structure and can add per-chapter.
 *
 * Idempotent via upsert on (brand_id, chapter_key).
 */
async function seedChapterVideos(brandId: string, code: BrandCode) {
  // Same demo YouTube videos used by Chapter 2's "hello" video step. Real
  // chapter videos will be uploaded per brand by Blue Maven.
  const TITLES: Record<BrandCode, string> = {
    ht: "Welcome to Hounds Town",
    ct: "Welcome to Cruisin' Tikis",
  };
  const DESCRIPTIONS: Record<BrandCode, string> = {
    ht: "Two minutes on who we are, what makes us different, and what to expect as you explore franchise ownership with us.",
    ct: "Two minutes on the brand, the boats, and what life as a Cruisin' Tikis owner actually looks like.",
  };

  const { error } = await app.from("chapter_videos").upsert(
    {
      brand_id: brandId,
      chapter_key: "explore",
      title: TITLES[code],
      video_url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      video_provider: "youtube",
      description: DESCRIPTIONS[code],
      cta_dismiss_label: "Got it",
      is_active: true,
    },
    { onConflict: "brand_id,chapter_key" },
  );
  if (error) {
    if (/chapter_videos/.test(error.message)) {
      throw new Error(
        `chapter_videos upsert failed (did you run 20260424_chapter_videos.sql?): ${error.message}`,
      );
    }
    throw new Error(`chapter_videos upsert failed: ${error.message}`);
  }
  console.log(`[seed] chapter_videos -> ${code} / explore`);
}

/**
 * PR 31: chapter intro popups. Seeds one per brand for each STAGES key so
 * every chapter has a friendly intro on first arrival. Idempotent via
 * upsert(brand_id, chapter_key).
 */
async function seedChapterIntros(brandId: string, code: BrandCode) {
  // Per-chapter copy. Mirrors the warm, conversational voice of the journey.
  // PR 38: Chapter 2 ('first_chat') now carries the rich pre-call prep
  // content that used to live on the call_prep page — heading, body with
  // "What we'll cover" / "Come prepared" sections, bullets, and a partner
  // callout. Per-brand overrides for first_chat below; everything else
  // shares one set of generic copy that admins can rewrite per-brand via
  // /admin/structure → "Intro popup".
  interface IntroEntry {
    heading: string;
    body_md: string;
    bullets: Array<{ icon: string; text: string }>;
    cta: string;
    partner_callout_text: string | null;
    pre_dismiss_checklist: { heading: string; items: string[] } | null;
  }

  // PR 40: shared pre-booking checklist for both brands' Chapter 2 intro.
  // Gates the popup CTA until the candidate confirms each commitment.
  // PR 41: dropped the partner item — that nudge moved into the
  // partner_callout_text block (rendered as a glowing brand-bordered
  // callout above the checklist), so duplicating it here was redundant.
  const FIRST_CHAT_CHECKLIST = {
    heading: "Before you book — quick check",
    items: [
      "I can be on a 60-minute video call (and not in my car 🚗)",
      "I'll be somewhere I can see a slide deck",
      "I'm ready for a real conversation, not a quick check-in",
    ],
  };

  const FIRST_CHAT_BY_BRAND: Record<BrandCode, IntroEntry> = {
    ht: {
      heading: "Before your Discovery Call",
      body_md: [
        "60 minutes with your franchise growth leader. We'll walk through a short deck together — but mostly it's a real conversation about what you're looking for and whether we're the right fit.",
        "",
        "## What we'll cover",
        "",
        "- Your timeline and the markets you're eyeing",
        "- How Hounds Town actually runs day-to-day",
        "- The economics — honestly",
        "- Whatever questions are top of mind for you",
        "",
        "## Come prepared",
        "",
        "- Think about what \"good\" looks like for you in a franchise",
        "- Jot down any questions about the brand or operations",
      ].join("\n"),
      bullets: [],
      cta: "Schedule the call",
      partner_callout_text:
        "If you have a spouse, partner, or co-investor — bring them along. These conversations are way better with the whole team. (Especially if that person is the one who'll make you write the check.)",
      pre_dismiss_checklist: FIRST_CHAT_CHECKLIST,
    },
    ct: {
      heading: "Before your Discovery Call",
      body_md: [
        "60 minutes with your franchise growth leader. We'll walk through a short deck together — but mostly it's a real conversation about what you're looking for and whether we're a fit.",
        "",
        "## What we'll cover",
        "",
        "- Your timeline and what waterfront markets you're considering",
        "- How Cruisin' Tikis actually runs day-to-day on the water",
        "- The vessel-based economics — honestly",
        "- Whatever questions are top of mind for you",
        "",
        "## Come prepared",
        "",
        "- Think about what \"good\" looks like for you in a franchise",
        "- Jot down any questions about the boats, permits, or operations",
      ].join("\n"),
      bullets: [],
      cta: "Schedule the call",
      partner_callout_text:
        "If you have a spouse, partner, or co-investor — bring them along. These conversations are way better with the whole team. (Especially if that person is the one who'll make you write the check.)",
      pre_dismiss_checklist: FIRST_CHAT_CHECKLIST,
    },
  };

  const INTROS: Record<string, IntroEntry> = {
    explore: {
      heading: "Welcome — let's get to know each other",
      body_md:
        "This first chapter is light. Walk through who we are, then a short application so we can get to know you. Both save as you go — close the tab whenever, pick up where you left off.",
      bullets: [
        { icon: "✨", text: "Brand tour — about 5 minutes" },
        { icon: "📝", text: "Light application — about 10 minutes" },
        { icon: "💾", text: "Auto-saves on every screen" },
      ],
      cta: "Show me around",
      partner_callout_text: null,
      pre_dismiss_checklist: null,
    },
    first_chat: FIRST_CHAT_BY_BRAND[code],
    deep_dive: {
      heading: "Now for the real deep dive",
      body_md:
        "An hour with our founder and a current franchisee. Live Tuesdays at 2pm ET, or watch on demand whenever works.",
      bullets: [
        { icon: "🎥", text: "Founder + franchisee on the line" },
        { icon: "❓", text: "Ask anything — that's the whole point" },
        { icon: "📊", text: "Covers model, support, unit economics" },
      ],
      cta: "Watch the deep dive",
      partner_callout_text: null,
      pre_dismiss_checklist: null,
    },
    playbook: {
      heading: "Under the hood",
      body_md:
        "The FDD — our franchise in document form. We've broken it into readable sections so you can move at your own pace. Mark questions as you go and we'll address them on our next call.",
      bullets: [
        { icon: "📖", text: "23 sections, broken up for readability" },
        { icon: "✏️", text: "Highlight + ask questions inline" },
        { icon: "⏱️", text: "Most candidates finish in a few sittings" },
      ],
      cta: "Open the playbook",
      partner_callout_text: null,
      pre_dismiss_checklist: null,
    },
    verify: {
      heading: "The verification round",
      body_md:
        "The formal bit. Background check, financial verification, and validation calls with current franchisees. Most of it happens quietly in the background — your only real task is picking two or three franchisees to talk to.",
      bullets: [
        { icon: "✅", text: "Background check — consent + ID" },
        { icon: "💳", text: "Financial verification" },
        { icon: "📞", text: "Validation calls with current owners" },
      ],
      cta: "Let's verify",
      partner_callout_text: null,
      pre_dismiss_checklist: null,
    },
    visit: {
      heading: "Come see us in person",
      body_md:
        "Your day at HQ. Meet the whole team, see operations live, walk the path of a typical day. Lunch is on us. This is the confirmation step on both sides.",
      bullets: [
        { icon: "📍", text: "One day at HQ — usually a Tuesday" },
        { icon: "✈️", text: "We cover travel + hotel" },
        { icon: "🍽️", text: "Lunch is on us" },
      ],
      cta: "Plan my visit",
      partner_callout_text: null,
      pre_dismiss_checklist: null,
    },
    award: {
      heading: "Ready to make it official?",
      body_md:
        "The last step — sign the franchise agreement and you're one of us. Territory locked in, training scheduled, doors ahead.",
      bullets: [
        { icon: "🏆", text: "Sign the franchise agreement" },
        { icon: "🗺️", text: "Lock in your territory" },
        { icon: "🎓", text: "Training schedule + first 90 days" },
      ],
      cta: "Make it official",
      partner_callout_text: null,
      pre_dismiss_checklist: null,
    },
  };

  const rows = Object.entries(INTROS).map(([chapter_key, intro]) => ({
    brand_id: brandId,
    chapter_key,
    heading: intro.heading,
    body_md: intro.body_md,
    hero_image_url: null,
    bullets: intro.bullets,
    cta_dismiss_label: intro.cta,
    is_active: true,
    // Default the banner on for every seeded chapter — admins can flip
    // off per-chapter via /admin/structure → "Intro popup".
    show_as_banner: true,
    partner_callout_text: intro.partner_callout_text,
    pre_dismiss_checklist: intro.pre_dismiss_checklist,
  }));

  const { error } = await app
    .from("chapter_intro_popups")
    .upsert(rows, { onConflict: "brand_id,chapter_key" });
  if (error) {
    if (/chapter_intro_popups/.test(error.message)) {
      throw new Error(
        `chapter_intro_popups upsert failed (did you run 20260423_welcome_and_chapter_intro_popups.sql?): ${error.message}`,
      );
    }
    throw new Error(`chapter_intro_popups upsert failed: ${error.message}`);
  }
  console.log(
    `[seed] chapter_intro_popups: ${rows.length} chapters seeded for brand ${brandId}`,
  );
}

/**
 * PR 36: chapter complete popups. Seeds Chapter 1's celebration for each
 * brand so the demo flow shows the new "🎉 Chapter 1 complete!" moment
 * after application submit. Other chapters stay unseeded so admins see the
 * empty state in /admin/structure and can add per-chapter copy.
 *
 * Idempotent via upsert(brand_id, chapter_key).
 */
async function seedChapterCompletes(brandId: string, code: BrandCode) {
  void code;
  const { error } = await app.from("chapter_complete_popups").upsert(
    {
      brand_id: brandId,
      chapter_key: "explore",
      heading: "Chapter 1 complete!",
      body_md:
        "Great job. Next up: a real conversation with your franchise growth leader.",
      cta_label: "Keep going",
      is_active: true,
    },
    { onConflict: "brand_id,chapter_key" },
  );
  if (error) {
    if (/chapter_complete_popups/.test(error.message)) {
      throw new Error(
        `chapter_complete_popups upsert failed (did you run 20260424_chapter_complete_popups.sql?): ${error.message}`,
      );
    }
    throw new Error(`chapter_complete_popups upsert failed: ${error.message}`);
  }
  console.log(`[seed] chapter_complete_popups -> ${brandId} / explore`);
}

async function seedDevCandidate(
  brandId: string,
  code: BrandCode,
  repId: string,
) {
  const { token, firstName, email, prefilledZip, prefilledPhone } =
    DEV_TOKENS[code];

  // Upsert candidate identity in bmave-core — includes the assigned rep
  // so scheduling knows whose calendar to query.
  const { data: candidate, error: cErr } = await core
    .from("candidates")
    .upsert(
      {
        email,
        first_name: firstName,
        last_name: "Rivera",
        brand_id: brandId,
        lifecycle_stage: "candidate",
        assigned_rep_id: repId,
      },
      { onConflict: "email" },
    )
    .select("id")
    .single();
  if (cErr || !candidate) throw new Error(`candidates upsert failed: ${cErr?.message}`);

  // Look up any existing portal row for this token (idempotent safeguard)
  const { data: existing } = await app
    .from("candidates_in_portal")
    .select("id, current_chapter, current_step")
    .eq("token", token)
    .maybeSingle();

  const row: Record<string, unknown> = {
    candidate_id: candidate.id,
    token,
    // Land new dev tokens on Chapter 1 / Step 0 (Brand tour) so the slides
    // renderer exercises on first load. Existing rows keep their state.
    current_chapter: existing?.current_chapter ?? 0,
    current_step: existing?.current_step ?? 0,
    // PR 37: stamp prefilled_zip on every reseed so flipping the per-brand
    // value above immediately reflects in the test candidate's flow.
    prefilled_zip: prefilledZip,
    // PR 42: same pattern for prefilled_phone — application's verification
    // screen pre-populates and shows a "Prefilled from your record" hint.
    prefilled_phone: prefilledPhone,
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

  // One demo rep (Kevin) — all test candidates get assigned to him so the
  // schedule content type has a real calendar to talk to.
  const repId = await seedDemoRep();

  for (const brand of brands) {
    const code = SLUG_TO_CODE[brand.slug];
    if (!code) {
      console.warn(`[seed] skipping unknown slug "${brand.slug}" (${brand.name})`);
      continue;
    }
    console.log(`[seed] -> ${brand.name} (${code})`);
    await seedBrandInfra(brand.id, code);
    await seedPortalContent(brand.id, code);
    await seedChapters(brand.id, brand.slug);
    await seedSteps(brand.id, code);
    await seedChapterVideos(brand.id, code);
    await seedChapterIntros(brand.id, code);
    await seedChapterCompletes(brand.id, code);
    await seedDevCandidate(brand.id, code, repId);
  }

  // One-off across brands: any existing schedule step that predates the
  // PR 16 polish passes gets event_label / working_days / min_notice_hours
  // filled in so behavior matches new steps.
  await backfillScheduleConfigDefaults();

  console.log("[seed] done");
}

main().catch((e) => {
  console.error("[seed] failed:", e);
  process.exit(1);
});
