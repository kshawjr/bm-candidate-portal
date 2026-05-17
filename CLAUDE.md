# bm-candidate-portal

Blue Maven's multi-brand Candidate Portal — Next.js + Supabase, integrated with Zoho CRM via webhooks. Currently in active launch phase.

## Stack
- Next.js 14.2.35 (App Router)
- Supabase (@supabase/ssr) for auth and DB
- TypeScript
- Tailwind for styling
- Resend for transactional email (planned)
- Deployed via Vercel — production target: cpflightdeck.bmave.com or similar

## Architecture
- **Public portal**: `/portal/[token]` — token-gated candidate experience, 7-stop journey
- **Admin area**: `/admin/*` — candidates, content, structure management
- **Zoho integration**: bidirectional via webhooks (`/api/webhooks/zoho-lead-created`, `/api/webhooks/zoho-lead-updated`) and ad-hoc API calls
- **PDF generation**: `/api/pdf/[applicationId]` for candidate snapshots

## Brand theming
The portal is multi-brand — Hounds Town, Cruisin' Tikis, future brands. Brand selection drives styling, copy, and asset choices. See the candidate-portal skill for the structure.

## Local commands
- `npm install` to install deps
- `npm run build` to verify production build
- `npm run lint` for linting
- `npm run dev` if local server needed (production-only workflow generally)

## Conventions
- Branch naming: feature/[short-desc], fix/[short-desc], pr-[N]-[desc] (existing pattern)
- PRs target main; merge auto-deploys via Vercel
- Run `npm run build` before pushing substantive changes
- Production-only workflow — local dev server rarely used

## Files to be careful with
- .env.local — production Supabase + Zoho secrets
- /app/api/webhooks/ — server routes touching real Zoho data
- Middleware (auth gating, affects every request)

## Known issues / tech debt
- 3 npm audit vulnerabilities (1 critical) — do not run `npm audit fix --force`, fix deliberately
- `Failed to find font override values for font Nunito Sans` warning during build — cosmetic, address when convenient

## Current state (May 2026 launch)
- Foundation deployed
- PR #2 just merged (Candidate Portal Admin card added to /ops on flightdeck)
- Next priority sequence: Vercel deploy to flightdeck.bmave.com → Discovery audit → Resend setup with domain verification → Zoho integration PRs 46–48

## Related skills
- `candidate-portal` skill defines the 7-stop journey, brand theming system, and content/stop structure. Auto-loads when working in this repo.

## Context
- Lives on the flightdeck mini at ~/projects/bluemaven/internal/bm-candidate-portal/
- Vercel team: Blue Maven Tech
- Vercel project name: bm-candidate-portal
