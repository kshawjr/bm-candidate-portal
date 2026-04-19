# Blue Maven Candidate Portal

Client-facing portal at `bmave.com/portal/[token]` where franchise candidates
move through the seven-stop journey (Explore → First chat → Deep dive → Playbook
→ Verify → Visit → Welcome), brand-skinned per client.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS v4
- Supabase — two projects:
  - `bm-candidate-portal` (this app's own state)
  - `bmave-core` (shared brands/candidates across all Blue Maven apps)

## Setup

1. Install deps:
   ```bash
   npm install
   ```
2. Copy env template and fill in values:
   ```bash
   cp .env.local.example .env.local
   ```
   You'll need Supabase URL + anon + service-role keys for the app's own
   project, plus the URL + service-role key for `bmave-core`. Everything else
   is optional for local dev.
3. Seed stops, steps, per-brand portal content, and two dev tokens:
   ```bash
   npm run seed
   ```
   See [Seeding](#seeding) for details.
4. Start dev server:
   ```bash
   npm run dev
   ```

## Seeding

`npm run seed` runs `scripts/seed.ts` and is idempotent — safe to re-run any
time (uses `.upsert()` with unique-key conflicts). Source of truth for the
seed data is `docs/design-prototypes/candidate-portal-design-v18.html`.

What it writes:

| Target                                      | Rows |
| ------------------------------------------- | ---- |
| `bmave-core.portal_content` (per brand)     | 9    |
| `bm-candidate-portal.stops_config`          | 7    |
| `bm-candidate-portal.steps_config`          | 20   |
| `bmave-core.candidates` (dev test accounts) | 1    |
| `bm-candidate-portal.candidates_in_portal`  | 1    |

Currently recognizes brand slugs `hounds-town-usa` and `cruisin-tikis`. Other
brands in `bmave-core.brands` are skipped with a warning.

### Dev tokens after seeding

| Token             | Brand          | Lands on                                 |
| ----------------- | -------------- | ---------------------------------------- |
| `test-token-123`  | Hounds Town    | Stop 2 · First chat → Before the call    |
| `test-token-456`  | Cruisin' Tikis | Stop 2 · First chat → Before the call    |

Dev tokens land on Stop 2 (First chat) rather than Stop 1 so the static
content type renders on first load. Click any earlier stop in the sidebar to
see the other content types (all show placeholders until their renderers ship).

## Proof of life

Visit `http://localhost:3000/portal/test-token-123` after seeding. You should
see:

- Full cinematic shell (280px brand sidebar + sticky step strip + content area)
- All 7 stops in the sidebar with per-brand primary color, progress meter, and
  advisor card
- "Before the call" static step rendering real seeded copy
- Clicking other stops/steps switches the content area

## Data architecture

Two Supabase projects:

- **`bmave-core`** — shared across all Blue Maven apps. Source of truth for
  `brands`, `candidates`, `portal_content`, `users`. Server-side reads only,
  via `lib/core-client.ts`.
- **`bm-candidate-portal`** — this app's own project. Owns
  `candidates_in_portal`, `stops_config`, `steps_config`, `candidate_progress`,
  `application_responses`. Accessed via `lib/supabase-app.ts`.

Cross-project foreign keys (e.g., `candidates_in_portal.candidate_id` →
`bmave-core.candidates.id`) are enforced at the application layer, not the DB.

See `.claude/skills/candidate-portal/SKILL.md` for the full build guide.

## Content types

Every step renders one of seven content types. As of PR 3:

| Type          | Status                        |
| ------------- | ----------------------------- |
| `static`      | ✅ Implemented (this PR)      |
| `slides`      | Placeholder                   |
| `application` | Placeholder                   |
| `schedule`    | Placeholder                   |
| `video`       | Placeholder                   |
| `document`    | Placeholder                   |
| `checklist`   | Placeholder                   |

## Scripts

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run start` — run built app
- `npm run lint` — Next.js lint
- `npm run typecheck` — TypeScript check
- `npm run seed` — idempotent seed (see [Seeding](#seeding))
