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

The route URL is historical — the implementation is **module-agnostic**.
The Deluge function below sends a `module` field with each payload, so
the same function (and the same webhook URL) can be wired to Contacts
or Deals workflow rules later without code changes on this side. Today
only `module: "Leads"` is fully implemented; `Contacts` and `Deals` are
dispatched but return `501 not_implemented` until their upstream
automations exist.

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
  the field values at fire time). The `module` field is a static
  string the workflow rule sets; the webhook routes on it so the same
  endpoint can later serve Contacts and Deals rules without code
  changes here:

  ```json
  {
    "record_id": "${Leads.Lead Id}",
    "module": "Leads",
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

### Deluge custom function (module-agnostic)

The Workflow Rule action is set to *Custom Function* and calls
`notifyPortalUnlocksWebhook(recordId, moduleName)`. For the Leads rule,
pass `recordId = ${Leads.Lead Id}` (mapped via the rule's argument
mapping) and `moduleName = "Leads"` as a static value. Future rules on
Contacts / Deals call the same function with `moduleName = "Contacts"`
or `"Deals"` — no code change on this side.

```deluge
void automation.notifyPortalUnlocksWebhook(int recordId, string moduleName)
{
    record = zoho.crm.getRecordById(moduleName, recordId);

    unlocksRaw = ifnull(record.get("Portal_Unlocks"), "");
    unlocksList = list();
    if(unlocksRaw != "")
    {
        unlocksList = unlocksRaw.toList(";");
    }

    ownerMap = ifnull(record.get("Owner"), map());
    ownerEmail = ifnull(ownerMap.get("email"), "");
    ownerId = ifnull(ownerMap.get("id"), "");

    payload = map();
    payload.put("record_id", recordId.toString());
    payload.put("module", moduleName);
    payload.put("modified_time", zoho.currenttime.toString("yyyy-MM-dd'T'HH:mm:ssXXX"));
    payload.put("Portal_Unlocks", unlocksList);

    ownerPayload = map();
    ownerPayload.put("email", ownerEmail);
    ownerPayload.put("id", ownerId);
    payload.put("Owner", ownerPayload);

    headers = map();
    headers.put("Content-Type", "application/json");

    response = invokeurl
    [
        url: "https://cpflightdeck.bmave.com/api/webhooks/zoho-lead-updated"
        type: POST
        parameters: payload.toString()
        headers: headers
    ];

    info "Webhook response: " + response.toString();
}
```

To add HMAC signing, extend the function to compute
`zoho.encryption.hmacSha256(secret, payload.toString())` and put it on
the `X-Zoho-Webhook-Signature` header. The portal webhook accepts both
hex and base64 encodings.

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

### Direct POST test

Useful for verifying the webhook path without going through Zoho.
Replace `<sig>` with a valid HMAC (or unset `ZOHO_WEBHOOK_SECRET`
locally):

```bash
curl -X POST https://cpflightdeck.bmave.com/api/webhooks/zoho-lead-updated \
  -H "Content-Type: application/json" \
  -H "X-Zoho-Webhook-Signature: <sig>" \
  -d '{
    "record_id": "5380286000072096013",
    "module": "Leads",
    "modified_time": "2026-05-14T12:00:00-04:00",
    "Portal_Unlocks": ["webinar_unlocked"],
    "Owner": {"email": "kevin@bmave.com", "id": "123"}
  }'
```

Expected: `200 { ok: true, candidate_id, updates: [...] }`.

### Dedup test

POST the same payload twice in quick succession. The second response
should be `{ ok: true, dedup: true }` with no DB writes. The dedup
key is `module-record_id-modified_time`, so a Lead and a Contact
with the same numeric ID won't collide once Contacts comes online.
Re-edit the Lead in Zoho (which bumps `modified_time`) and the
webhook processes normally.

### Invalid-key test

Set `Portal_Unlocks` in Zoho to include `webniar_unlocked` (typo).
The webhook should drop the typo and not write it to `unlocked_keys`.
Confirm via the `webhook_events` row and a direct DB check.

### Unimplemented-module test

Send a payload with `module: "Contacts"` (or `"Deals"`). The
dispatcher returns `501 { ok: false, reason: "not_implemented",
module: "Contacts" }` cleanly — no crash, no DB writes, audit row
gets `status = "noop"` with `error_message = "module_not_implemented:Contacts"`.

### Old-payload-shape test

Send a payload with the old `lead_id` field instead of `record_id`.
The webhook returns `400 { error: "Missing required fields:
record_id and modified_time" }`. The shape changed in a clean break
— there's no grace period for the old payload. Update the Deluge
function to send `record_id` + `module`.

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
