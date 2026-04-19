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
   You'll need Supabase URL + anon + service-role keys for the app's own project,
   plus the URL + service-role key for `bmave-core`. Everything else is optional
   for the proof-of-life page.
3. Start dev server:
   ```bash
   npm run dev
   ```

## Proof of life

Visit `http://localhost:3000/portal/[token]` where `[token]` matches a row in
`candidates_in_portal.token`. The page resolves the token through:

```
candidates_in_portal (app DB)
  → bmave-core.candidates (via candidate_id)
  → bmave-core.brands    (via brand_id)
```

and renders `Hello {first_name}, welcome to {brand name}` — confirming both
Supabase connections work end-to-end.

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

## Scripts

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run start` — run built app
- `npm run lint` — Next.js lint
- `npm run typecheck` — TypeScript check

## What's in this scaffold (PR 1)

- Next.js 14 App Router + TypeScript + Tailwind v4
- Two Supabase clients (`lib/supabase-app.ts`, `lib/core-client.ts`)
- `/portal/[token]` proof-of-life page
- Landing placeholder at `/`

**Deliberately NOT in PR 1:** cinematic shell UI, content types, stops/steps
seeding, Zoho integration, email, admin UI.
