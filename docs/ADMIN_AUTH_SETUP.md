# Admin Auth Setup

One-time configuration Kevin needs to complete before the `/admin` routes
will work locally or in production. The app ships with the code; these steps
hook Google OAuth into Supabase.

## 1. Google Cloud Console — OAuth 2.0 Client ID

1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Click **Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Blue Maven Admin (Candidate Portal)`.
5. **Authorized redirect URIs** — add both:
   - `https://<your-bm-candidate-portal-ref>.supabase.co/auth/v1/callback`
     (replace `<ref>` with your Supabase project ref — find it in the
     Supabase dashboard URL or Project Settings → API)
   - `http://localhost:3000/auth/callback` (for local dev)
6. Create. Copy the **Client ID** and **Client Secret**.

> If your Google Cloud project doesn't have an OAuth consent screen yet,
> you'll be prompted to create one. Pick **Internal** if `@bmave.com` is a
> Google Workspace; otherwise **External** and add Kevin's address as a
> test user. Scopes: `openid`, `email`, `profile`.

## 2. Supabase — enable Google provider

1. Supabase dashboard → the `bm-candidate-portal` project →
   **Authentication → Providers → Google**.
2. Toggle **Enabled** on.
3. Paste the Client ID + Client Secret from step 1.
4. Save.

## 3. Env vars

The portal already uses these — confirm they're present in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

No new env vars are required for PR 12a.

## 4. Verify the flow

```bash
npm run dev
```

1. Visit [http://localhost:3000/admin](http://localhost:3000/admin).
2. You should be redirected to `/admin/sign-in` (middleware gate).
3. Click **Sign in with Google**. Complete the Google flow.
4. Expected outcomes:
   - **`@bmave.com` account**: land on `/admin` dashboard with welcome
     message + brand selector.
   - **Other Google account**: land on `/admin/access-denied`. Clicking
     "Sign out and try again" clears the session and returns to sign-in.
5. The top-bar **Sign out** link should return you to `/admin/sign-in`.

## Files touched

Nothing outside `app/admin/`, `app/auth/callback/`, `middleware.ts`,
`lib/supabase-auth.ts`, and `components/admin/`. The candidate portal
(`/portal/[token]`) is completely untouched by this PR.

## What's intentionally missing

This PR is foundation only. The dashboard is a placeholder — "Editor coming
in the next update." Content-card editing, image uploads, step pickers, etc.
ship in PR 12b.
