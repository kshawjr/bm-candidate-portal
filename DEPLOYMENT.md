# Deployment

This app deploys as a single Next.js project on Vercel and serves three
production hostnames:

| Hostname | Role |
|---|---|
| `houndstowndiscovery.bmave.com` | Hounds Town candidate portal |
| `cruisintikisdiscovery.bmave.com` | Cruisin' Tikis candidate portal |
| `cpflightdeck.bmave.com` | Admin (cross-brand) |

The Next.js middleware (`middleware.ts`) inspects the incoming `Host`
header on every request, attaches `x-hostname` / `x-brand-type` /
`x-brand-id` / `x-brand-slug` headers, and gates `/admin` to the admin
host only. The hostname → brand map lives in
`lib/brand-from-hostname.ts` — edit there when adding a new brand.

## DNS — one-time setup per subdomain

For each of the three subdomains, add a `CNAME` record pointing at
Vercel:

```
houndstowndiscovery.bmave.com    CNAME  cname.vercel-dns.com
cruisintikisdiscovery.bmave.com  CNAME  cname.vercel-dns.com
cpflightdeck.bmave.com             CNAME  cname.vercel-dns.com
```

TTL: anything reasonable (3600s is fine).

## Vercel project — custom domains

In the Vercel project settings → **Domains**, add all three hostnames.
Vercel will validate the CNAME and provision SSL certificates
automatically. No nginx, no manual cert management.

## Google OAuth — authorized redirect URIs

The admin sign-in flow uses Google OAuth. After the multi-domain
deployment, add the admin host's callback URL to the authorized URIs in
the Google Cloud Console for the OAuth client:

- `https://cpflightdeck.bmave.com/auth/callback`

The brand portal subdomains do **not** need callback URIs — candidates
authenticate via tokenized URL, not Google sign-in.

For local development, the existing `http://localhost:3000/auth/callback`
entry stays.

## Adding a new brand

When a third brand ships:

1. Add a row to `bmave-core.brands` with `slug` + `id`.
2. Pick a subdomain (e.g. `newbranddiscovery.bmave.com`) and add the
   CNAME + Vercel custom domain.
3. Edit `lib/brand-from-hostname.ts`:
   - Add the hostname → `{ brandSlug, brandId }` entry under
     `PORTAL_HOSTS`.
   - Add the brand's marketing site URL to `getBrandMarketingUrl`.
4. Deploy. Middleware picks up the new mapping immediately.

## Verification after deploy

1. `https://houndstowndiscovery.bmave.com` → redirects to
   `hounds-town-usa.com`.
2. `https://cruisintikisdiscovery.bmave.com` → redirects to
   `cruisintikis.com`.
3. `https://cpflightdeck.bmave.com/admin` → admin loads, Google sign-in
   works.
4. `https://houndstowndiscovery.bmave.com/portal/<HT-token>` → renders.
5. `https://houndstowndiscovery.bmave.com/portal/<CT-token>` →
   redirects to `https://cruisintikisdiscovery.bmave.com/portal/<CT-token>`.
6. `https://cpflightdeck.bmave.com/portal/<any-token>` → renders (admin
   can preview any brand).
7. `https://houndstowndiscovery.bmave.com/admin` → redirects to
   `https://cpflightdeck.bmave.com/admin`.

## Local development

`npm run dev` continues to work at `http://localhost:3000`. localhost
hostnames are treated as admin mode by `getBrandFromHostname`, so the
brand-mismatch redirect doesn't fire and admins can preview any
candidate by token.

## Zoho Webhook Setup

After deploying the lead-creation webhook receiver (PR 51):

1. **Custom fields on the Zoho Leads module** — create two text fields:
   - `Portal_Token` (single-line text)
   - `Portal_URL` (URL)

2. **Generate the signing secret.** A 32+ character random string,
   stored as `ZOHO_WEBHOOK_SECRET` in Vercel (Project Settings →
   Environment Variables, scope: Production + Preview). Generate one
   per environment so prod and preview can't replay each other's
   webhooks. Share with whoever sets up the Zoho-side signing.

3. **Zoho workflow rule.** Setup → Automation → Workflow Rules →
   Create rule. Trigger: Lead created. Action: Webhook → POST to
   `https://cpflightdeck.bmave.com/api/webhooks/zoho-lead-created`.
   - Header: `X-Zoho-Webhook-Signature: <HMAC-SHA256(body, secret) as hex>`
     (Zoho's workflow webhook UI doesn't sign natively — implement the
     HMAC in a Deluge function that runs before the POST.)
   - Body (JSON): `Lead_ID`, `First_Name`, `Last_Name`, `Email`,
     `Phone`, `Zip_Code`, `ParseID`.

4. **Gravity Forms redirect.** On each brand's lead form (e.g.
   hounds-town-usa.com): After-submit redirect to
   `https://cpflightdeck.bmave.com/loading?email={email}`. The form
   continues to fire its existing Zoho lead-creation action — the
   redirect just gives the user something to look at while the
   webhook processes.

5. **Welcome email template.** Update the existing Zoho welcome email
   to include `${Portal_URL}` so candidates get a direct link in the
   email even if they navigate away from the loading page.

## Candidate progress tracking (PR 54)

The portal writes a row to `candidate_events` for every meaningful
candidate interaction (page-level dedup deferred to PR 55). A subset
of these events — `MILESTONE_EVENTS` in `lib/candidate-events.ts` —
sync to the candidate's Zoho Lead so sales sees stage-level progress
in CRM.

1. **Run the migration.** Apply
   `supabase/migrations/20260503_candidate_events.sql` against the
   `bm-candidate-portal` Supabase project.

2. **Custom fields on the Zoho Leads module** — create two more
   fields alongside `Portal_Token` / `Portal_URL`:
   - `Portal_Status` (single-line text — values written by the app
     come from `ZOHO_STATUS_BY_MILESTONE` in
     `lib/candidate-events.ts`: "Portal Accessed", "Education
     Complete", "Application Started", "Application Submitted",
     "Discovery Scheduled", "Discovery Completed", "Verifying",
     "Verified", "Offer Sent", "Awarded")
   - `Last_Active_Date` (date — ISO-8601 timestamps; Zoho stores as
     date+time)

3. **Sync mechanics.** Milestone sync runs out-of-band via Vercel's
   `waitUntil` so it doesn't block server actions or page renders.
   Failed syncs are persisted on the row (`zoho_sync_status =
   'failed'` + `zoho_sync_error`) for a future retry worker.
   Candidates without a `zoho_lead_id` (test seeds, manual rows) are
   marked `'skipped'` rather than retried.

## Zoho Blueprint transitions (PR 56)

Some milestones also fire a Lead Blueprint transition so the lead
advances through the formal sales pipeline in addition to having its
custom fields updated.

| Milestone | Blueprint transition |
|---|---|
| `education_completed` | New → Engaged |
| `discovery_scheduled` | Engaged → Discovery Call Booked |

Transition IDs live in `lib/zoho-blueprint-transitions.ts`. Both
brands share the same Lead Blueprint, so the IDs aren't
brand-specific.

**Finding new transition IDs.** Setup → Process Management →
Blueprint → click the Lead Blueprint → click each transition arrow.
The transition ID shows in the side panel.

**Failure model.** Field updates and Blueprint transitions run as
two independent calls. Either can fail without the other:

- `zoho_sync_status` tracks the field-update outcome
- `blueprint_transition_status` tracks the transition outcome —
  `'skipped'` when the milestone has no transition mapped
  (e.g., `portal_first_visit`)

A failed transition is non-fatal: Portal_Status still updates, the
event row records `blueprint_transition_status = 'failed'` with the
error in `blueprint_transition_error`. Common cause: the lead is
already in the target state. Re-fire by manually moving the lead in
Zoho or re-triggering the milestone in test mode.

**Migrations.** Both PR 54 and PR 56 ship a migration; apply both
against the `bm-candidate-portal` Supabase project:
- `20260503_candidate_events.sql` (table + indexes)
- `20260503_candidate_events_blueprint.sql` (transition status
  columns)

## Application-submitted extras (PR 61)

The `application_submitted` milestone fires two extra Zoho writes
beyond the standard Portal_Status field update:

1. **`CQ_Received`** (DateTime field on the Lead). Sales filters on
   this for "leads who finished the application" reports.
2. **`Application Submitted`** tag attached to the lead. Sales also
   uses tags for at-a-glance filtering.

**One-time Zoho setup:**

- Setup → Customization → Modules and Fields → Leads → +Field →
  DateTime → name `CQ_Received`. Save.
- The tag is created on first attach — no upfront work needed.

**Sync mechanics.** Both writes are best-effort and tracked
independently of the Portal_Status update on the event row:

- `cq_sync_status` / `cq_sync_error` track the CQ_Received write
- `tag_sync_status` / `tag_sync_error` track the tag attach

For non-`application_submitted` milestones, these columns stay
null. For app_submitted on a candidate without a `zoho_lead_id`,
they're marked `'skipped'` (same pattern as
`blueprint_transition_status`).

**Migration.** Apply `20260503_candidate_events_app_submitted_extras.sql`
against the `bm-candidate-portal` Supabase project.
