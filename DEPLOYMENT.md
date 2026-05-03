# Deployment

This app deploys as a single Next.js project on Vercel and serves three
production hostnames:

| Hostname | Role |
|---|---|
| `houndstowndiscovery.bmave.com` | Hounds Town candidate portal |
| `cruisintikisdiscovery.bmave.com` | Cruisin' Tikis candidate portal |
| `flightdeck.bmave.com` | Admin (cross-brand) |

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
flightdeck.bmave.com             CNAME  cname.vercel-dns.com
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

- `https://flightdeck.bmave.com/auth/callback`

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
3. `https://flightdeck.bmave.com/admin` → admin loads, Google sign-in
   works.
4. `https://houndstowndiscovery.bmave.com/portal/<HT-token>` → renders.
5. `https://houndstowndiscovery.bmave.com/portal/<CT-token>` →
   redirects to `https://cruisintikisdiscovery.bmave.com/portal/<CT-token>`.
6. `https://flightdeck.bmave.com/portal/<any-token>` → renders (admin
   can preview any brand).
7. `https://houndstowndiscovery.bmave.com/admin` → redirects to
   `https://flightdeck.bmave.com/admin`.

## Local development

`npm run dev` continues to work at `http://localhost:3000`. localhost
hostnames are treated as admin mode by `getBrandFromHostname`, so the
brand-mismatch redirect doesn't fire and admins can preview any
candidate by token.
