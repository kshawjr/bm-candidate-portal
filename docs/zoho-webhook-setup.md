# Zoho webhook setup — lead-updated + Portal_Unlocks

This doc covers the one-time Zoho configuration needed for the
`zoho-lead-updated` webhook (introduced with the waiting content type
+ unlock system PR). The webhook does two things from a single Zoho
Lead edit:

1. **Unlock sync.** Mirror the `Portal_Unlocks` multi-select picklist
   into `candidates_in_portal.unlocked_keys` (text[]). The waiting
   renderer subscribes to that column via Supabase realtime and
   transitions to its unlocked state as soon as it gains the matching
   key.
2. **Rep reassignment freshness.** Re-resolve the Lead's `Owner.email`
   against `bmave-core.reps` and update `candidates.assigned_rep_id`
   if it changed. Closes backlog item #5 — manual rep edits in Zoho
   now propagate to the portal without a re-seed.

The webhook lives at `app/api/webhooks/zoho-lead-updated/route.ts`
and is reachable at `POST /api/webhooks/zoho-lead-updated` under
whichever host the portal is deployed at
(`cpflightdeck.bmave.com/api/webhooks/zoho-lead-updated` for prod).

---

## Step 1 — Create the `Portal_Unlocks` picklist

In Zoho CRM (admin → Modules and Fields → **Leads** → Add Field):

- **Field type:** Multi-Select Pick List
- **Field name:** `Portal_Unlocks`
- **API name** (Zoho normalizes): `Portal_Unlocks`
- **Picklist values** — copy/paste these exactly. The webhook filters
  anything unrecognized through `lib/unlock-keys.ts → isValidUnlockKey`,
  so a typo here means the value silently drops on the floor:

  ```
  discovery_call_unlocked
  webinar_unlocked
  fdd_unlocked
  verification_unlocked
  discovery_day_unlocked
  award_unlocked
  ```

Save. Confirm the field appears in the Lead layout (Field Permissions
must include the user roles that will edit it — typically franchise
reps).

> **Naming convention.** Each value describes WHAT GETS UNLOCKED, not
> what was completed. `webinar_unlocked` = "the webinar chapter is now
> accessible." This makes the picklist read naturally to reps adding
> values from the Lead view ("add webinar_unlocked").

---

## Step 2 — Create the Workflow Rule

Zoho CRM → Setup → Automation → Workflow Rules → **Create Rule**:

- **Module:** Leads
- **Rule name:** `Portal sync — unlocks + owner`
- **When:** *Edit* — *Specific field(s) updated*
- **Fields:** `Portal_Unlocks`, `Owner` (multi-select both)
- **Condition:** None (fire on every edit of the watched fields)
- **Action:** *Webhook*

### Webhook configuration

- **Name:** `Portal — lead updated`
- **URL:** `https://cpflightdeck.bmave.com/api/webhooks/zoho-lead-updated`
  (use the dev/staging host during testing)
- **Method:** POST
- **Body Type:** Form-Data → Custom (raw JSON)
- **Custom body** — paste this template (Zoho replaces `${...}` with
  the field values at fire time):

  ```json
  {
    "lead_id": "${Leads.Lead Id}",
    "modified_time": "${Leads.Modified Time}",
    "Portal_Unlocks": ${Leads.Portal_Unlocks},
    "Owner": {
      "email": "${Leads.Owner.email}",
      "id": "${Leads.Owner.id}"
    }
  }
  ```

  > **Caveat:** `${Leads.Portal_Unlocks}` is rendered as a delimited
  > string in some Zoho configurations and a JSON array in others.
  > The webhook handles both — see `route.ts` for the parsing fork.

### Signature header

Zoho's Workflow Rule webhook UI doesn't natively support HMAC, so
either:

- **Option A** (preferred): use a Deluge custom function as the
  Workflow action instead of the built-in webhook. The Deluge function
  computes `zoho.encryption.hmacSha256(secret, body)` and sets the
  `X-Zoho-Webhook-Signature` header on a `invokeurl` call. Mirror the
  shape of `lead-created`'s function.

- **Option B** (test/dev only): bypass signature verification by
  setting `ZOHO_WEBHOOK_SECRET=""` (the webhook returns 500 in this
  case — don't ship this).

The HMAC verification accepts both hex and base64 encodings — see
`verifySignature` in the route file.

---

## Step 3 — Test

After creating the rule:

1. Open any Lead in Zoho.
2. Set `Portal_Unlocks` to `webinar_unlocked` and save.
3. Within ~5 seconds, the candidate's `candidates_in_portal.unlocked_keys`
   should contain `webinar_unlocked` (verify via Supabase SQL editor).
4. The waiting card in the candidate's portal should auto-transition
   to its unlocked state (no refresh needed).
5. In `webhook_events`, you should see a row with
   `event_type = 'zoho_lead_updated'`, `status = 'success'`, and an
   `error_message` summarizing the applied updates.

### Dedup test

POST the same payload twice in quick succession (use `curl` against
the webhook URL with `--header 'X-Zoho-Webhook-Signature: <sig>'`).
The second response should be `{ ok: true, dedup: true }` with no DB
writes. Re-edit the Lead (which bumps `modified_time`) and the
webhook processes normally — the dedup key is `lead_id-modified_time`.

### Invalid-key test

Set `Portal_Unlocks` in Zoho to include `webniar_unlocked` (typo).
The webhook should drop the typo and not write it to `unlocked_keys`.
Confirm via the `webhook_events` row and a direct DB check.

---

## Adding a new unlock key

When the journey grows or a new chapter goes behind a gate:

1. Add the constant + display label to `lib/unlock-keys.ts`.
2. Add the same literal value to the `Portal_Unlocks` picklist in
   Zoho — exact match. Typo and the webhook silently drops it.
3. Create / update a waiting step in `scripts/seed.ts` (or the admin
   editor) with the new `unlock_key`.
4. Run the seed against staging first to confirm the value flows
   end-to-end; then production.

No DB migration needed for new keys — `unlocked_keys` is `text[]`.
