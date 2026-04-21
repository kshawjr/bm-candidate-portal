# Schedule content type — Google Calendar setup

The `schedule` content type (PR 16) lets candidates pick a slot on the
advisor's Google Calendar. Until the two env vars below are set, the
portal shows a friendly "scheduling is being set up" card instead of a
picker.

Setup is a one-time Google Cloud task. You need a service account with
access to write to the advisor's calendar, plus either domain-wide
delegation or per-calendar sharing.

## 1. Create a Google Cloud project + service account

1. Go to <https://console.cloud.google.com/>, create (or pick) a project.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **IAM & Admin → Service accounts → Create service account**.
   - Name: `bmave-candidate-portal-scheduler` (anything works).
   - No extra roles are required at the project level.
4. Open the service account → **Keys → Add Key → JSON**. Download the
   key file. Keep it safe — it's the one secret that matters.

## 2. Give the service account calendar access

Pick **one** of the two options below.

### Option A — Domain-wide delegation (recommended if you control the Workspace)

Works best when the advisor email is a Blue Maven / Workspace address
(e.g. `zac@bmave.com`). Lets the service account act *as* the advisor
when creating events.

1. In the service account detail page, copy the numeric **Client ID**
   (under "Advanced settings" or "OAuth 2.0 Client IDs").
2. Go to <https://admin.google.com> (super-admin account).
3. **Security → Access and data control → API controls → Manage
   domain-wide delegation → Add new**.
4. Paste the Client ID from step 1.
5. Scopes (comma-separated):
   ```
   https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/calendar.events
   ```
6. Save.

### Option B — Share the advisor's calendar directly

Works even without Workspace admin access.

1. Open the advisor's Google Calendar settings for their primary
   calendar.
2. **Share with specific people or groups → Add people**.
3. Paste the service account email (ends in
   `@<project-id>.iam.gserviceaccount.com`).
4. Permission: **Make changes and manage sharing**.

The code path still uses `subject` (the advisor email) in the JWT auth,
so option B requires the service account email to match a valid calendar
user too. If you hit permission errors with option B, fall back to
option A.

## 3. Wire the credentials into the portal

Open the downloaded JSON key. Copy two values into `.env.local`:

```bash
# The service account's email
GOOGLE_SERVICE_ACCOUNT_EMAIL="bmave-candidate-portal-scheduler@your-project.iam.gserviceaccount.com"

# The private key. IMPORTANT: preserve the embedded \n as a literal — don't
# convert to real newlines. The portal's lib/google-calendar.ts replaces
# them back before handing the key to the JWT signer.
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...lots of chars...\n-----END PRIVATE KEY-----\n"
```

Restart `npm run dev`. The schedule renderer will start calling
`freeBusy.query` and `events.insert` against the configured advisor's
calendar.

## 4. Set the advisor email per brand

The advisor calendar is stored on `bmave-core.brands.advisor_calendar_email`.
For the seeded brands, `scripts/seed.ts` backfills it with
`zac@bmave.com` if empty. To change it:

```sql
update public.brands
set advisor_calendar_email = 'someone-else@bmave.com'
where slug = 'hounds-town-usa';
```

(An admin UI to edit this per-brand is planned but not in PR 16.)

## Troubleshooting

**The portal shows "scheduling is being set up"** — either
`GOOGLE_SERVICE_ACCOUNT_EMAIL` / `..._PRIVATE_KEY` are missing, or the
brand has no `advisor_calendar_email`.

**`invalid_grant: Invalid JWT Signature`** — the private key in env is
malformed. Most common cause: newlines got stripped. Re-paste the exact
string from the JSON key file with the `\n` sequences intact.

**`caller does not have permission`** — the service account can't read
or write to the advisor's calendar. Revisit step 2 — either domain-wide
delegation scopes are missing, or the direct share was granted with
read-only permission.

**`events.insert` returns 403 after domain-wide delegation is set up**
— the scopes you authorized in Workspace don't match the scopes the app
requests. Make sure both `auth/calendar` and `auth/calendar.events` are
in the delegation config.

## Local testing without Google setup

- The video content type works without any setup — test with the
  seeded YouTube placeholder.
- Admin editing of schedule steps works without setup — you'll see a
  "Calendar not connected" notice in the admin but the config fields
  still save.
- Only the candidate-facing slot picker and booking flow require the
  env vars.
