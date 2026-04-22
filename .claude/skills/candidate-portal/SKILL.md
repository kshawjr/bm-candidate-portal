---
name: candidate-portal
description: Use when building, modifying, or reasoning about the Blue Maven Candidate Portal — a multi-brand Next.js client-facing portal that guides franchise candidates from invitation through franchise award. Covers architecture, data model, brand theming system, the seven-chapter journey, content types, design voice, and integration points with Zoho CRM and Supabase. Invoke for any task involving the portal's UI, per-brand customization, chapter/step configuration, candidate flows, or admin interfaces.
---

# Candidate Portal — Build Guide

> **Note:** The term "chapter" replaced "stop" in PR 20 (April 2026). Legacy
> references may still exist in older commits and merged PR descriptions.

## What this is

A client-facing Next.js application at `bmave.com/portal/[token]` where franchise candidates move through a structured evaluation journey with the brand they're considering. The portal is brand-skinned per client (Hounds Town USA, Cruisin' Tikis, etc.), token-authenticated (no login), and mirrors state from Zoho CRM via webhooks into Supabase.

The portal is separate from but part of the same ecosystem as FlightDeck (the client-facing admin portal at `flightdeck.bmave.com`). Both share the Brand Studio config.

## Core metaphor and vocabulary

The candidate is on a **journey**. The journey has **chapters** (7 of them). Each chapter has **steps** (typically 2-4). Each step has its own **content type**.

**Do not** use the word "stages" — it was deprecated in favor of "chapters." The journey metaphor is central: candidates travel through chapters, they don't grind through stages.

**Seven chapters, in order:**

| # | Chapter (label) | Full name | Purpose |
|---|---|---|---|
| 1 | Explore | Education & qualification | Brand tour + light application |
| 2 | First chat | Discovery call | 30-min kickoff call with franchise team |
| 3 | Deep dive | Education webinar | Founder + current franchisee webinar |
| 4 | Playbook | FDD exploration | The franchise disclosure document, readable form |
| 5 | Verify | Verification | Background check + financial verification + franchisee validation calls |
| 6 | Visit | Discovery Day | In-person visit to HQ |
| 7 | Welcome | Franchise award | Agreement signing, onboarding kickoff |

Chapter 1 (Explore) is always the starting chapter. Candidates do not enter the journey pre-qualified; they start at Chapter 1 and complete it first.

## Design voice and principles

- **Light and fluffy, not Game of Thrones.** No dark themes, no ominous gravitas. Warm, open, confident without being aggressive.
- **Conversational, not form-like.** Especially the application — one question per screen, questions phrased like a human asked them, not labels on a database field.
- **Never feels like paperwork.** Even the FDD stage is framed as "under the hood" not "mandatory disclosure document."
- **Sensitive questions get permission.** Bankruptcy, criminal history, financials — always prefaced with "we ask because we have to — it won't automatically disqualify you."
- **Ranges over exact numbers.** Financial fields use 5-bucket dropdown ranges, never open text.
- **The candidate is always in control.** Saves as they go. Pause anytime. Revisit any completed chapter.
- **Color palette comes from the brand.** Blue Maven provides the skeleton; the brand provides the skin.

## Tech stack

- **Framework:** Next.js 14 App Router, TypeScript, Tailwind CSS v4
- **Database:** Supabase (Postgres + auth)
- **CRM sync:** Zoho CRM (US data center) via webhooks → Supabase mirror
- **Calendar sync:** Google Apps Script for Zoho-Calendar sync of validation sessions
- **Email:** Resend from `support@bmave.com`
- **Deploy:** Vercel (auto-preview on PR, prod on main)
- **Project mgmt:** ClickUp (webhook-driven; see FlightDeck for pattern)
- **Fonts:** Inter (sans, variable), Fraunces (serif, italic for accents)

## Authentication model

**No logins.** Each candidate gets a signed, tokenized URL: `bmave.com/portal/[token]`. The token maps to a Supabase row in `candidates` that links to their Zoho deal. Token is set in an HTTP-only cookie on first visit for subsequent navigation. Tokens can be long-lived (months) but should be revocable server-side.

Admin users (Blue Maven team) use a separate auth path for Brand Studio and Step Config pages — use Supabase auth there.

## Data architecture — shared `bmave-core` + per-app extensions

Candidate Portal does not own all its data. It extends a shared Blue Maven data layer. Understanding this before writing any schema is critical — duplicating what belongs in the shared layer is the most likely source of data drift across Blue Maven projects.

### The shared layer: `bmave-core` Supabase project

A separate Supabase project named `bmave-core` holds data that is read by multiple Blue Maven applications. Four tables live there:

#### `bmave-core.brands`
The canonical, organization-wide brand registry. Eventually synced from Zoho CRM via webhook (source of truth for brand config lives in Zoho). For now, seeded directly and editable via admin UI. Read by every Blue Maven app that renders branded UI: Candidate Portal, Validation, Candidate Profile, FlightDeck (eventually), future initiatives.
```
id              uuid primary key default gen_random_uuid()
slug            text unique not null     -- "hounds-town-usa"
name            text not null             -- "Hounds Town USA"
parent_brand    text                      -- "TourScale" for Cruisin' Tikis (optional parent-org relationship)
tagline         text
colors          jsonb not null            -- { primary, secondary, accent, dark, soft }
logo_url        text
mark_url        text
font_overrides  jsonb
created_at      timestamptz default now()
updated_at      timestamptz default now()  -- auto-updated via trigger
```
RLS enabled; no public policies (service role access only).

#### `bmave-core.candidates`
The canonical record of every franchise candidate tracked across Blue Maven's candidate-facing systems. One row per candidate. Same person as they move through Portal → Validation → Candidate Profile → awarded → franchisee. Lifecycle transitions tracked via `lifecycle_stage` enum.
```
id                uuid primary key default gen_random_uuid()
email             text unique not null
first_name        text
last_name         text
phone             text
zoho_contact_id   text unique              -- Zoho CRM contact ID (source of truth)
zoho_deal_id      text                     -- Zoho CRM deal ID
brand_id          uuid references brands(id)
lifecycle_stage   text not null default 'candidate'   -- candidate|validating|awarded|franchisee|inactive
created_at        timestamptz default now()
last_touched_at   timestamptz default now()
```
Check constraint on `lifecycle_stage`. Indexes on `zoho_contact_id`, `email`, `brand_id`, `lifecycle_stage`. RLS enabled; no public policies.

**Naming note:** this table is `candidates` (not `candidates`) because Kevin wanted clearer terminology. These rows are only franchise candidates — not Blue Maven's client contacts (who live in `users`).

#### `bmave-core.portal_content`
Marketing content, slides, stats, and narrative copy that render in the Candidate Portal and other candidate-facing modules. Editable per-brand by Blue Maven admins. Each brand has its own content set.
```
id           uuid primary key default gen_random_uuid()
brand_id     uuid not null references brands(id) on delete cascade
content_key  text not null            -- e.g. "hero_title", "stat_1_num", "slide_1_body"
content_type text not null            -- hint for the editor UI: "text" | "number" | "image_url" | "markdown"
title        text
body         text
data         jsonb                    -- for structured content (e.g. an array of slide configs)
created_at   timestamptz default now()
updated_at   timestamptz default now()
unique(brand_id, content_key)
```
Indexed on `brand_id`. RLS enabled; no public policies.

#### `bmave-core.users`
Blue Maven's client contacts (1-3 per brand) who log into Blue Maven tools, plus Blue Maven's internal team. Each user is scoped to a brand and has permissions that determine what they can access.
```
id            uuid primary key default gen_random_uuid()
email         text unique not null
first_name    text
last_name     text
brand_id      uuid references brands(id)
role          text not null default 'client'    -- 'client' | 'bm_admin' | 'bm_team'
auth_token    text unique
can_access    jsonb not null default '[]'::jsonb   -- e.g. ["help_desk", "candidate_pipeline", "operational_tool_x"]
created_at    timestamptz default now()
last_login_at timestamptz
```
Check constraint on `role`. Indexed on `email`, `brand_id`, `auth_token`. RLS enabled; no public policies.

### The Candidate Portal's own Supabase project (`bm-candidate-portal`)

A separate Supabase project holds Candidate Portal's application-specific state. These tables reference `bmave-core` tables via FK where applicable (cross-project FKs not DB-enforced — application layer enforces integrity).

#### `candidates_in_portal`
Per-candidate session state in the Portal. `candidate_id` links to `bmave-core.candidates.id`.
```
id                 uuid primary key default gen_random_uuid()
candidate_id       uuid not null              -- FK to bmave-core.candidates.id (cross-project)
token              text unique not null       -- URL token for /portal/[token]
current_chapter       int not null default 0     -- index into chapters (0 = Explore)
current_step       int not null default 0     -- current step within current chapter
progress           jsonb not null default '{}'::jsonb
is_tour_complete   boolean not null default false
is_app_submitted   boolean not null default false
created_at         timestamptz default now()
last_active_at     timestamptz default now()
```
Indexed on `token`, `candidate_id`. RLS enabled.

**Why this table, not in `bmave-core`:** Portal session state (current_chapter, current_step, is_tour_complete) is Portal-specific. Other apps don't need it. The identity fields (email, name, brand) stay in `bmave-core.candidates`.

#### `chapters_config`
Per-brand override of the default 7-chapter structure. Most brands won't override. `brand_id` references `bmave-core.brands.id`.
```
id             uuid primary key default gen_random_uuid()
brand_id       uuid not null             -- FK to bmave-core.brands.id
chapter_key       text not null             -- "explore", "first_chat", etc.
position       int not null
label          text not null
name           text not null
icon           text
content        jsonb
created_at     timestamptz default now()
unique(brand_id, chapter_key)
```

#### `steps_config`
Per-brand per-chapter configuration of steps. Where the team decides which content types go into each step for each brand.
```
id             uuid primary key default gen_random_uuid()
brand_id       uuid not null             -- FK to bmave-core.brands.id
chapter_key       text not null
position       int not null
step_key       text not null             -- "tour", "schedule", etc.
label          text not null
description    text
content_type   text not null             -- enum: slides|static|application|schedule|video|document|checklist
config         jsonb not null default '{}'::jsonb
created_at     timestamptz default now()
unique(brand_id, chapter_key, step_key)
```
Check constraint on `content_type`.

#### `candidate_progress`
Audit log of chapter/step completions.
```
id                        uuid primary key default gen_random_uuid()
candidate_in_portal_id    uuid not null references candidates_in_portal(id) on delete cascade
chapter_key                  text not null
step_key                  text
completed_at              timestamptz default now()
metadata                  jsonb
```

#### `application_responses`
Stores candidate answers to the Chapter 1 light application. Maps to Zoho fields on submit.
```
id                        uuid primary key default gen_random_uuid()
candidate_in_portal_id    uuid not null references candidates_in_portal(id) on delete cascade
field_key                 text not null
field_value               jsonb
created_at                timestamptz default now()
updated_at                timestamptz default now()
unique(candidate_in_portal_id, field_key)
```

### Cross-project reads (from Candidate Portal to `bmave-core`)

Candidate Portal's server-side code reads `brands`, `candidates`, and `portal_content` from `bmave-core`. Use a separate Supabase client pointed at `bmave-core` with the service role key:

```typescript
// lib/core-client.ts
import { createClient } from '@supabase/supabase-js';

export const coreClient = createClient(
  process.env.NEXT_PUBLIC_BMAVE_CORE_URL!,
  process.env.BMAVE_CORE_SERVICE_ROLE_KEY!
);
```

**Reads are server-side only.** Never expose the `bmave-core` service role key to the browser. Fetch brand config + portal content in `generateStaticParams`, `getServerSideProps`, or in React Server Components during page render, then pass resolved data down to client components.

For writes to `bmave-core.candidates` (e.g., when the candidate updates their phone during the application), the Candidate Portal can either:
1. Write directly via the service role client (fast)
2. Push to Zoho first, then let Zoho's webhook sync back to `bmave-core.candidates` (source-of-truth consistent, but with sync lag)

Preferred pattern: **write to Zoho first, let the webhook propagate**. This keeps Zoho as the unambiguous source of truth.

### When to put data in `bmave-core` vs Candidate Portal's own project

Rule of thumb: **does another Blue Maven app need to read this?**
- **Yes → `bmave-core`.** Brands, candidates (the identity), users, portal content.
- **No → Candidate Portal's own project.** Chapters/steps configuration, application answers, per-candidate session state, progress audit log.

When in doubt, start in Portal's own project. Promoting to `bmave-core` is easy later; demoting from it is painful.

### Why not one shared Supabase project for everything?

1. **Risk scoping.** Candidate Portal is outward-facing (candidates use it). FlightDeck is internal. Mixing outward-facing tables with internal admin data raises the blast radius of any misconfigured RLS policy.
2. **Billing / observability.** Each Supabase project has its own dashboard, usage metering, query logs. Debugging is easier when you don't filter by app.

### Not modeled in v1 (explicit deferrals)

- **FlightDeck's tables** — FlightDeck currently has its own brand/user tables in its own Supabase project. It will be refactored to read from `bmave-core.brands` and `bmave-core.users` in a later sprint. Don't block Candidate Portal on this migration.
- **`user_permissions` as a separate table** — For now, permissions live as a JSONB array in `users.can_access`. If permissions become too complex to manage inline, extract into a separate `user_permissions` table later.
- **Validation project's tables** — `validation_sessions`, `validator_assignments` live in the Validation project's own Supabase when that project is built. References `candidates.id` from `bmave-core`.
- **Candidate Profile project's tables** — `profile_narratives`, `transcripts`, `generation_jobs` live in the Candidate Profile project's own Supabase. References `candidates.id` from `bmave-core`.
- **Operational tool tables** — Each tech-project client's custom operational tool has its own Supabase project scoped to that client's data.

### Zoho CRM as the source of truth

All candidate data ultimately lives in Blue Maven's Zoho CRM. `bmave-core.candidates` is a mirror that gets synced from Zoho via webhook. Apps read from the mirror (fast, no Zoho API rate limits on every page load) and write to Zoho (writes cascade back to `bmave-core.candidates` via the webhook sync).

Brand configuration can *eventually* also live in Zoho (as custom fields on the Account/Organization record) with webhook sync to `bmave-core.brands`. For now, brands are edited directly in `bmave-core.brands` by Blue Maven admins. Either pattern is supported by the architecture.

### Tenancy model per client

- **Franchise-sales-only clients (e.g., Hounds Town, Cruisin' Tikis):** use Blue Maven's Zoho CRM. Candidate data written by the Portal lands in Blue Maven's Zoho. The brand's admin sees their candidate pipeline via FlightDeck, reading from Blue Maven's Zoho.
- **Tech/operational clients (e.g., Bee Organized):** have their own Zoho instance. Operational tools built for them write to *their* Zoho. Blue Maven feeds them data into their own Zoho but doesn't use their CRM for internal purposes.

## Cross-project data flow — the candidate lifecycle

A person moves through multiple Blue Maven systems over the course of their franchise journey. Understanding this flow is essential to not building overlapping features.

### Stage 1: Entry at Candidate Portal
- Invite email generated from Zoho deal creation → candidate receives tokenized URL
- First visit to `/portal/[token]`:
  - `bmave-core.candidates` row created (or located by `zoho_contact_id`) with `lifecycle_stage = 'candidate'`
  - Candidate Portal's `candidates` row created, keyed by `person_id`
- Candidate moves through Chapters 1-4 (Explore, First chat, Deep dive, Playbook)

### Stage 2: Verification activates Validation project
- When candidate reaches Chapter 5 (Verify), the Validation project activates for this person
- Validation project queries `bmave-core.candidates` to find their session
- Validation creates its own `validation_sessions` rows referencing `person_id`
- The validation calls they make, validators assigned, status updates — all owned by Validation
- Candidate Portal's "Validation" step checklist reflects Validation project state (via cross-project read or shared API)
- `bmave-core.candidates.lifecycle_stage` may flip to `'validating'` during this window

### Stage 3: Candidate Profile runs (in parallel with Stages 1-4+)
- Candidate Profile project consumes transcripts from call recordings (Rede.AI via Make.com)
- It generates AI narratives, stored in its own `profile_narratives` table keyed by `person_id`
- Blue Maven users review/approve in Candidate Profile's admin views
- Candidate Portal does NOT directly render these narratives to candidates — they're internal artifacts

### Stage 4: Chapters 6-7 (Visit, Welcome)
- Discovery Day attendance tracked (via `candidate_progress` in Portal + Zoho updates)
- On Welcome completion, `bmave-core.candidates.lifecycle_stage` flips to `'awarded'`
- Then `'franchisee'` once the franchise agreement is countersigned
- At this point FlightDeck may begin tracking this franchisee as a user of FlightDeck (a separate lookup via `zoho_contact_id`, not a duplication of the person row)

### Key design principle

**Each Blue Maven app owns its own state, but not its own view of who the person is.** The person is defined once in `bmave-core.candidates`. Every other app extends with its own per-person data but never forks the identity.

## The seven content types

Every step renders one of these seven content types. Each is a React component that takes a config object and a candidate context.

### `slides`
Chapter-pacing content. Existing v18 reference: brand tour. One slide per screen, prev/next/dots. Slide types: title, pillars (3-col), stats, quote, video, cta. Content stored as `slides[]` in step config, plus per-slide data. For production, the plan is to upload Canva-exported PNGs per slide via Brand Studio rather than code-render templates — but the templates stay as the fallback renderer.

### `static`
A static content page — text, images, optional inline video. Markdown body + optional hero image. Used for: "Before the call" summaries, "Travel + stay" logistics, "Your invitation" details, etc.

### `application`
The conversational 22-question light application. Six themed chapters (basics / world / money / vision / story / sign). Question types: single_select, multi_select, slider, short_text, long_text, field_pair, address_block, agreement, submit_confirm, success. Financial questions use ranges. Auto-saves. On submit, pushes to Zoho Lead/Opportunity fields.

### `schedule`
Calendar booking widget. Calendly-style embed or custom picker. Writes the chosen time to Zoho Calendar via Google Apps Script sync, creates a validation session record, and emails the candidate + assigned franchise team member.

### `video`
Embedded video player. YouTube, Vimeo, or direct hosted. Tracks completion via player events — a step is complete when ≥90% watched OR manually marked complete.

### `document`
Document reader. The FDD primarily — 23 sections rendered readably with a side table of contents, section-level Q&A annotations, "mark read" per section. Accepts PDF-backed or Notion-backed document configs.

### `checklist`
Items to complete. Used for verification (background check consent, ID upload, financial verification, validation call completion). Each item can require: file upload, form fill, external link visit, or a simple checkbox.

## UI architecture — the cinematic shell

Every authenticated view renders inside the cinematic shell. The shell has three regions:

### Left sidebar (persistent, 280px)
- **Brand mark** at top — brand name in brand-primary color, serif italic on emphasis word (e.g., "Cruisin' *Tikis*", "Hounds Town *USA*")
- **Brand subtitle** — small caps "FRANCHISE DISCOVERY PORTAL" and optional "POWERED BY [parent brand]"
- **Progress meter** — "YOUR JOURNEY 0%" label, thin progress bar, "X of 7 chapters / ~Y weeks left"
- **Chapters list** — the 7 chapters as vertical tab buttons with emoji icons, active-state highlight (3px brand-color accent bar on left edge + light bg), done/current/locked states with different icons
- **Advisor card** at bottom — "YOUR FRANCHISE GROWTH LEADER" label + name + role + email

### Top step strip (persistent, 80px)
- **Title line** — "Chapter X · [Chapter Full Name]"
- **Step count** — "N steps"
- **Step cells** — each showing step number, label, one-line description. Active cell has brand-color bottom border. Done cells have filled number circle.

### Main content area (adapts to content type)
- On first arrival to Chapter 1 (fresh candidate, nothing done): shows a **marketing hero** above the step content — editorial headline with italic serif accent on emphasis words, body paragraph, warm-amber stat bar. This hero is shown **only** on the first visit to the portal; it collapses to just step content on subsequent views.
- Otherwise: shows the step header (eyebrow "Step X of N", title, description) followed by the step's content type component, followed by a step footer with Previous/Next/Finish navigation.

### Design details
- **Border radius:** 14px on cards (`--radius-lg`), 8px on inputs/buttons (`--radius-md`)
- **Sidebar background:** `#faf9f5` (warmer than the cream content bg `#F6F5F0`)
- **Brand color applied via CSS vars:** `--brand-primary`, `--brand-secondary`, `--brand-accent`, `--brand-soft`, `--brand-wash`, `--brand-dark`
- **Accent warm-amber** used for marketing hero stat numbers and eyebrow labels: `#d97706` or similar brand-accent
- **Fonts:** Inter for UI, Fraunces italic for emphasis words in hero titles and brand marks
- **Confetti** fires on step completion and journey completion, in brand-complementary pastels
- **Polite animations:** 150-300ms fades/slides. Never spring-bouncy. Never jarring.

## Flow and state machine

### Initial state (new candidate, no progress)
- `current_chapter = 0` (Explore)
- `selectedChapterIdx = 0` (viewing Explore)
- `selectedStepIdx = 0` (viewing first step = Brand tour)
- Marketing hero visible above step content
- Only Chapter 1 is interactive in sidebar; Chapters 2-7 show locked icons
- Step strip shows Explore's two steps: Brand tour (current) + Light application (locked-ish, visible but unclickable until tour done)

### Completing Chapter 1
- Candidate walks through Brand tour slides, hits "Finish tour" on last slide → sets `isTourComplete = true`, auto-advances `selectedStepIdx` to 1 (Light application)
- Candidate fills out + submits Light application → sets `isAppSubmitted = true`, advances `current_chapter` to 1 (First chat), confetti fires, hero collapses permanently
- On return to journey view: Chapter 1 shows check in sidebar, Chapter 2 pulses as current

### Mid-journey
- Candidate always defaults to viewing their current chapter on login
- They can click any completed or current chapter in the sidebar to revisit
- They cannot click locked chapters (clearly disabled)
- Within a chapter, they can click any step (no artificial locking between steps of the same chapter — they can skip around or go backward)

### Completing a chapter
- Chapters 2-7 have no single "submit" gesture; they're either marked complete by the candidate (e.g., "I've finished the webinar") or by Blue Maven team intervention (e.g., Discovery Day attended, agreement signed)
- In production, chapter completion triggers come from Zoho CRM via webhook — not from candidate-side button clicks alone
- For prototyping/testing, include a "mark complete" dev button on each chapter

### All chapters complete
- Final Welcome celebration: "You're officially part of [brand]" with confetti
- Sidebar shows all 7 checks
- Optional: portal transitions to a "you're now a franchisee" post-award experience (out of scope for v1)

## Brand-specific content

Each brand has its own marketing hero, stats, concepts, and advisor. These live in `brands.marketing` as JSONB:

```json
{
  "eyebrow": "Franchise Ownership Discovery Portal",
  "heroTitle": "The Water <em>Is Calling.</em><br>Are You Built for This?",
  "heroBody": "America's #1 floating tiki bar franchise...",
  "stats": [
    { "num": "44+", "label": "Open locations" },
    { "num": "$99K", "label": "Avg rev/vessel" }
  ],
  "concepts": [
    { "icon": "🌊", "title": "Explore", "body": "Understand the market..." },
    { "icon": "💬", "title": "Connect", "body": "Speak with our team..." }
  ],
  "leader": {
    "name": "Zac Celaya",
    "role": "Blue Maven Franchise Development",
    "email": "tourscale@bmave.com"
  }
}
```

Hero titles use HTML `<em>` tags for the words that should render in Fraunces italic + brand-primary color (e.g., "*Is Calling*", "*family*").

## Integration points

### Zoho CRM webhook receivers (Next.js API routes)
- `POST /api/webhooks/zoho/deal-updated` — when a Zoho deal stage changes, update `candidates.current_chapter`
- `POST /api/webhooks/zoho/deal-field-changed` — sync other fields (validator list, financials)

### Webhook → Supabase flow
Never hit Zoho on page loads. Always read from Supabase mirror. Write-through for candidate-initiated changes (application submission, step completion) — Supabase first, then push to Zoho via a job queue or direct API call in the mutation.

### Zoho field mapping (application submission)
Maps the 22 application answers to Zoho Lead/Opportunity fields. Exact mapping documented in a separate `zoho-field-map.md` — reference that file for field names. Ranges (e.g., `"500-1m"` for net worth) post as the range string to a custom picklist field.

### Google Calendar ↔ Zoho sync
For Stage 2 (First chat) scheduling: when a candidate books via the schedule widget, the system should:
1. Write the event to Google Calendar
2. Replace-all the validator attendees on the Zoho Validation Session record (not diff — full replace every sync)
3. Email the candidate + assigned franchise team member
4. Update `candidates.progress` with the booked time

Built with Google Apps Script, not Make.com (Make's operation-based billing is a meaningful constraint).

## Admin interfaces

Admin location is **TBD** — Kevin is deciding whether admin lives inside FlightDeck, as a new thin admin app, or inside Candidate Portal's own admin section. For now:

- FlightDeck's existing admin section already manages brands and users (reading from its own Supabase project currently).
- FlightDeck will eventually migrate to read/write `bmave-core.brands` and `bmave-core.users`.
- When that migration happens, admin concerns (brand editing, portal content editing, user management) consolidate into FlightDeck's admin section.
- For Candidate Portal's v1, do NOT build admin UI. Seed data directly via SQL. Portal content and brand config can be updated via SQL during early testing.

### Eventual admin needs (not v1)

- **Brand Studio** — edit `bmave-core.brands` colors, logos, fonts. Likely syncs from Zoho eventually.
- **Portal Content Editor** — edit `bmave-core.portal_content` per-brand. Hero titles, stat numbers, slide copy, marketing narratives.
- **Chapter/Step Config** — edit `chapters_config` and `steps_config` in Candidate Portal's own Supabase per-brand.
- **Candidate list** — search/filter candidates, impersonate view, resend tokens.
- **Unified view per brand** — single admin login that shows help desk + candidate pipeline + operational tools + brand config, all for one brand, all in one interface.

## Key build decisions from prior design work

These were settled during 18 rounds of prototyping and architecture conversations — do not re-litigate without cause:

1. **Light theme, always.** Dark theme was explicitly rejected.
2. **Chapters not stages.** Journey metaphor is core.
3. **Seven chapters, in this order.** Explore → First chat → Deep dive → Playbook → Verify → Visit → Welcome.
4. **Chapter 1 (Explore) has two sub-steps:** Brand tour + Light application. No exceptions.
5. **Stage 5 (Verify) combines three things:** background check, financial verification, franchisee validation calls. Not three separate chapters.
6. **Steps are per-brand configurable.** Brand A might have 3 steps in Chapter 3 while Brand B has 4. The data model supports this.
7. **Step completion triggers come from Zoho**, not from candidate buttons (production behavior). Prototypes can include dev buttons.
8. **Replace-all for multi-record sync**, never diff. Applies to validator attendees, contact lists, any array field.
9. **Timestamps are database-set** (`created_at`), never client `new Date()`.
10. **Webhook processing over fire-and-forget** for async work (AI generation, email sends, etc.).
11. **Conversational application**, not a form. One question per screen. Ranges over exact numbers for financials. Sensitive questions get permission framing.
12. **Dogfood the roadmap.** Use the portal's own wishlist/feedback mechanism (when built) as the team's own product backlog.
13. **Shared data lives in `bmave-core`.** The `brands` and `candidates` tables are single sources of truth read by every Blue Maven app. Do not create parallel copies in any app-specific Supabase project.
14. **Brand Studio lives in FlightDeck.** Even though brand data is consumed by Candidate Portal (and others), the editing UI belongs in the admin tool.
15. **The person is defined once, across Blue Maven.** `bmave-core.candidates.id` is the canonical identity. Every candidate-facing app (Portal, Validation, Candidate Profile) references it via FK. No app forks its own person/candidate identity record.
16. **Candidate-facing projects extend, never duplicate.** Candidate Portal has `candidates` keyed on `person_id`. Validation has `validation_sessions` keyed on `person_id`. Candidate Profile has `profile_narratives` keyed on `person_id`. The name, email, brand association live in one place only: `bmave-core.candidates`.

## What NOT to build (for v1)

- Login flows. Tokens only.
- Dark mode.
- Multi-language support.
- Real-time collaboration (multiple candidates on one portal).
- Mobile-native apps. Responsive web only.
- Payment processing. Franchise fee goes through a separate, existing system.

## Suggested first PR

**Prerequisites — ALREADY COMPLETE:**
1. ✅ `bmave-core` Supabase project exists with four tables: `brands`, `candidates`, `portal_content`, `users`. RLS enabled on all, no public policies (service role access only). Indexes in place. Triggers for `updated_at` on `brands` and `portal_content`.
2. ✅ `brands` seeded with Hounds Town USA and Cruisin' Tikis (slug, name, parent_brand, tagline, colors).
3. ✅ `bm-candidate-portal` Supabase project exists with five tables: `candidates_in_portal`, `chapters_config`, `steps_config`, `candidate_progress`, `application_responses`. RLS enabled. Indexes and FK cascades in place.

**Then, inside `~/candidate-portal/`:**
1. Scaffolding: Next.js 14 with App Router, TypeScript, Tailwind CSS v4
2. Two Supabase clients:
   - `lib/supabase-app.ts` — reads/writes Candidate Portal's own project. Has both anon (client-side) and service role (server-side) variants.
   - `lib/core-client.ts` — reads `bmave-core` tables. Service role only, server-side only, never bundled to client.
3. Basic routing:
   - `/portal/[token]` — placeholder page that resolves token → `candidates_in_portal` → `bmave-core.candidates` → `bmave-core.brands` and renders a "Hello, {first_name}, welcome to {brand name}" page as proof of life.
   - `/` — landing/login placeholder.
4. `.env.local.example` with all required variables listed (both Supabase projects + placeholders for Zoho and Resend keys).
5. `.gitignore`, `README.md` (project overview, setup instructions).
6. Token auth middleware/helper: resolve `/portal/[token]` → candidate row → brand → return session object.

**Decisions deferred to later PRs (don't do these in PR 1):**
- Shell component rendering (sidebar, step strip, content area) — PR 2
- Seeding `chapters_config` and `steps_config` — PR 2 or via SQL/seed file (Kevin to decide when he gets there)
- Any content type implementations — PR 3+
- Actual Zoho integration — later
- Email sending — later
- Admin UI — not in v1

**Goal of PR 1:** prove the scaffolding works and both Supabase connections resolve end-to-end. Nothing fancy, just proof the plumbing works. Kevin should be able to visit `localhost:3000/portal/[some-test-token]` and see the brand's name render, sourced from `bmave-core`.

## Reference files from design prototyping

The 18 HTML prototype versions (`candidate-portal-design-v1.html` through `candidate-portal-design-v18.html`) live in `docs/design-prototypes/` (or wherever the team stashes them). v18 is the canonical reference for structure and voice. Earlier versions are useful for seeing iterations and understanding what was tried and rejected.

Key files to reference when building:
- `v18` — final architecture (chapters + steps + content types, cinematic shell)
- `v14` — vertical timeline treatment (alternative considered, rejected for 7-chapter density)
- `v16` — cinematic marketing hero + stats + concepts (where the visual language was established)
- `v8` — the 22-question conversational application in full detail

## Code reuse across the Blue Maven stack

Candidate Portal is one of several Blue Maven projects that share infrastructure and data. Before writing new integration code, check if an existing project already has a working version. The goal is to avoid duplicating significant infrastructure code, while also not prematurely extracting shared libraries before a clear pattern has emerged.

### The Blue Maven project landscape

All of these live as sibling folders in `~/` on Kevin's machine:

- **`~/flightdeck/`** — Admin portal for Blue Maven team. Manages clients (the brands themselves), users, help desk tickets, wishlist. Pulls select data from Zoho.
- **`~/candidate-portal/`** — (this project) Client-facing portal for franchise candidates. Token-auth, brand-skinned, per-chapter + per-step journey.
- **Candidate Profile project** — (location TBD — ask Kevin for path) Generates AI-authored candidate narratives from call transcripts. Heavy Zoho integration. Make.com + Rede.AI in the pipeline.
- **Validation project** — (location TBD — ask Kevin for path) Tracks validation sessions between candidates and existing franchisees. Google Calendar ↔ Zoho CRM sync via Google Apps Script.
- **`bmave-core` Supabase project** — (not a local codebase, lives only in Supabase) The shared data layer for `candidates` and `brands`.

### What to check in other projects before writing new code

**Zoho integration**
- **Check first:** Candidate Profile project and Validation project both already pull from Zoho. They likely have OAuth flow, token refresh, and field mapping helpers.
- **Before copying:** Ask Kevin where the cleanest Zoho client lives. Copy that one (or reference it and decide if a shared package makes sense).
- **Shared keys:** `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` are organizational credentials, same across all projects.

**Supabase patterns**
- FlightDeck has working patterns for typed database types, RLS policies, and client/server Supabase client setup.
- Check `~/flightdeck/` for `lib/supabase/` or `utils/supabase/` and follow the same pattern for Candidate Portal's own project connections.
- For `bmave-core` connections, a separate client instance is needed (different URL + keys). See the "Cross-project reads" section in the data architecture.

**Zoho webhook receivers**
- FlightDeck's `taskUpdated` and `taskStatusUpdated` handlers demonstrate webhook deduplication (in-memory Map keyed by event ID + short TTL). Zoho/ClickUp both fire webhooks twice sometimes; Candidate Portal will need this too.
- Validation project's calendar sync uses a "replace-all" pattern for validator attendees (not diff). Follow the same pattern in Candidate Portal if it ever needs to sync list fields.

**Resend / email**
- FlightDeck has the canonical email template pattern: modern light-theme card layout with colored pill badges, FROM address `support@bmave.com`. Candidate Portal emails should visually match.
- FlightDeck's double-email dedup pattern (in-memory Map) is the standard for webhook-triggered emails.

**Candidate narrative generation (Candidate Profile project)**
- The existing pipeline: Rede.AI transcribes calls via Make.com → stores in Supabase `call_transcripts` → webhook fetches transcript → Claude generates narrative → admin review via `/candidate/[uuid]/review` → Approve sets `status=approved`, `approved_by`, `approved_at`.
- Candidate Portal does NOT re-implement this. It surfaces Candidate Profile's output via cross-project read if/when needed, but the generation and review flow lives entirely in the Candidate Profile project.

**Google Calendar ↔ Zoho sync (Validation project)**
- Built with Google Apps Script, not Make.com.
- Watches calendar events → when validators are added/removed, replaces the full validator list on the Zoho Validation Session record (no diffing).
- Candidate Portal's Chapter 5 (Verify) "validation calls" step reads Validation's session state; it does NOT re-implement scheduling logic.

**Brand config editing (Brand Studio)**
- Brand Studio is a set of admin pages *inside FlightDeck* (not in Candidate Portal). Team uses FlightDeck as their admin console.
- Brand Studio reads and writes `bmave-core.brands` (not FlightDeck's own Supabase). One source of truth.
- When implementing any brand-editing UI in Candidate Portal, pause and ask Kevin — it almost certainly belongs in FlightDeck's Brand Studio instead.

### What NOT to duplicate — pause and ask Kevin first

- **`brands` table** — lives in `bmave-core`. Do not create a parallel `brands` table in Candidate Portal's Supabase project.
- **`candidates` table** — lives in `bmave-core`. Do not create a parallel people/candidates-as-identities table in Candidate Portal. Candidate Portal's `candidates` table references `bmave-core.candidates.id`, it does not contain the person's identity fields.
- **Zoho field mappings** — if Candidate Profile or Validation already has canonical mappings from Zoho Lead/Contact fields to internal models, use the same map. Don't maintain a parallel map that can drift.
- **Shared UI components** — if FlightDeck has polished components (email mockup, card shell, button library) that Candidate Portal needs too, consider whether to extract a shared package or copy-and-let-them-diverge. Small/simple: copy. Larger/stateful: ask.

### Practical rule for the first PR

For the scaffolding PR, **don't reach into other projects yet**. Get the Next.js + Tailwind + Supabase skeleton working in isolation, connecting only to Candidate Portal's own Supabase project. Once that's up, subsequent PRs that touch Zoho, Resend, or cross-project concerns should start by reading the equivalent code from `~/flightdeck/` (or asking Kevin for the path to Candidate Profile / Validation) and following its conventions.

### Environment variables

**For Candidate Portal specifically:**

| Key | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Candidate Portal's own Supabase project (NEW) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Candidate Portal's own Supabase project (NEW) |
| `SUPABASE_SERVICE_ROLE_KEY` | Candidate Portal's own Supabase project (NEW) |
| `NEXT_PUBLIC_BMAVE_CORE_URL` | `bmave-core` Supabase project URL (shared) |
| `BMAVE_CORE_SERVICE_ROLE_KEY` | `bmave-core` service role key (shared, server-only) |
| `ZOHO_CLIENT_ID` | Shared across Blue Maven projects |
| `ZOHO_CLIENT_SECRET` | Shared across Blue Maven projects |
| `ZOHO_REFRESH_TOKEN` | Shared across Blue Maven projects |
| `RESEND_API_KEY` | Shared across Blue Maven projects |
| `NEXT_PUBLIC_APP_URL` | Candidate Portal's own URL (NEW) |
| `ANTHROPIC_API_KEY` | Shared if/when AI features are added |

**Important:**
- Do NOT reuse any other project's Supabase project for Candidate Portal's app-specific tables. Create a fresh Supabase project for it.
- The `bmave-core` Supabase service role key is especially sensitive — it can read/write people and brands across all projects. Server-only, never exposed to the browser, never committed to git.
- For shared keys, copy values from `~/flightdeck/.env.local` (or wherever they're most current) to Candidate Portal's `.env.local`. Kevin's copy-paste-for-now approach is the right call until there are 3+ projects sharing the same keys regularly.

## Quick glossary

- **Chapter** — one of the seven phases of the journey (formerly "stage")
- **Step** — a sub-activity within a chapter (per-brand configurable)
- **Content type** — the kind of UI a step renders (slides, static, application, schedule, video, document, checklist)
- **Cinematic shell** — the persistent layout: left sidebar + top step strip + main content
- **`bmave-core`** — the shared Supabase project holding canonical `candidates` and `brands` tables, read by every Blue Maven app
- **Lifecycle stage** — the `people.lifecycle_stage` enum tracking where a person is across the whole Blue Maven ecosystem: `candidate` → `validating` → `awarded` → `franchisee` → `inactive`
- **Brand Studio** — admin pages *inside FlightDeck* for editing `bmave-core.brands`. Source of truth for brand config across all Blue Maven apps.
- **Step Config** — admin pages for picking content types and configuring steps per brand (likely also inside FlightDeck, but could also live in Candidate Portal's admin area — TBD)
- **Advisor card** — the "Your franchise growth leader" section in the sidebar bottom
- **The FDD** — Franchise Disclosure Document, rendered in Chapter 4 (Playbook)
- **Discovery Day** — in-person HQ visit, Chapter 6 (Visit)
- **Validation calls** — candidate calls with current franchisees, part of Chapter 5 (Verify). Managed by the Validation project, surfaced in Candidate Portal via cross-project read.
- **Candidate Profile** — separate Blue Maven project that generates AI narratives from call transcripts. References `bmave-core.candidates.id`. Not to be confused with Candidate Portal.
- **Validation project** — separate Blue Maven project tracking validation sessions. Google Apps Script-driven sync between Google Calendar and Zoho.
