# Admin Auth Disabled (Temporary)

Date disabled: May 3, 2026

Reason: Auth integration with flightdeck.bmave.com's Supabase Auth was
causing redirect loops. To unblock the team and let them start using the
candidate portal admin immediately, the auth gate has been temporarily
disabled.

Current state: Anyone with the URL https://cpflightdeck.bmave.com/admin
can access the admin. Trust the URL is internal-only.

Future fix options:
- Build proper SSO with flightdeck.bmave.com's Supabase project
- Set up email/magic-link auth via the bm-candidate-portal Supabase project
- Add IP allowlist or VPN-only access

Re-enable when one of those is in place.
