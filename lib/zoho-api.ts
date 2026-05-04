import "server-only";

// Lightweight Zoho CRM v3 client for write-back from the webhook
// receiver. Just enough to PUT custom fields onto a Lead — does not
// attempt to model the full Zoho API surface.
//
// OAuth pattern follows the canonical Blue Maven Zoho integration:
// long-lived refresh_token in env, short-lived access tokens minted
// on demand and cached in-memory until ~1 minute before expiry.
//
// Single shared instance (`zohoApi`) so the in-memory cache survives
// across requests within a Vercel function instance. Cold starts pay
// one extra refresh; hot instances reuse the same access token.

// Match the flightdeck pattern: API host is env-overridable so EU/IN/AU
// data-center accounts can point at zohoapis.eu / .in / .com.au without
// a code change. US (zohoapis.com) is the default since Blue Maven's
// Zoho lives there.
const API_DOMAIN = process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.com";

class ZohoApiClient {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;

    if (!refreshToken || !clientId || !clientSecret) {
      throw new Error(
        "Missing Zoho OAuth env vars (ZOHO_REFRESH_TOKEN / ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET).",
      );
    }

    const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });

    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (!response.ok || !data.access_token || !data.expires_in) {
      throw new Error(
        `Zoho token refresh failed: ${response.status} ${data.error ?? "unknown"}`,
      );
    }

    this.accessToken = data.access_token;
    // Refresh ~60s before the server's stated expiry to dodge clock skew.
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000 - 60_000;
    return this.accessToken;
  }

  async updateLead(
    leadId: string,
    fields: Record<string, string>,
  ): Promise<void> {
    // Force-string the lead id at the boundary. Zoho lead IDs (e.g.
    // 5380286000091668000) exceed Number.MAX_SAFE_INTEGER, so any caller
    // that accidentally passes a JS number would silently corrupt the id.
    // Coercing here means a single source of truth for the format.
    const id = String(leadId);

    const token = await this.getAccessToken();
    const response = await fetch(
      `${API_DOMAIN}/crm/v3/Leads/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json",
        },
        // Zoho v3 PUT /Leads/{id} requires the id in the body record too,
        // not just the URL — omitting it returns "the id given seems to
        // be invalid". Matches flightdeck's updateDeal pattern.
        body: JSON.stringify({ data: [{ id, ...fields }] }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Zoho updateLead ${response.status}: ${body}`);
    }
  }

  /**
   * Fire a Zoho Blueprint state transition on a Lead. Used by the
   * milestone sync to advance the lead through the formal sales
   * pipeline (e.g., "New" → "Engaged"). Distinct from `updateLead`,
   * which sets custom fields without touching Blueprint state.
   *
   * Zoho returns non-2xx for transitions that don't apply (e.g., the
   * lead is already in the target state, or the transition is gated
   * on data the lead doesn't have). Callers should catch and decide
   * whether to surface or swallow — for milestone sync, a failed
   * transition is non-fatal because the field updates already landed.
   */
  async transitionLead(
    leadId: string,
    transitionId: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    const id = String(leadId);
    const tid = String(transitionId);

    const token = await this.getAccessToken();
    const response = await fetch(
      `${API_DOMAIN}/crm/v3/Leads/${encodeURIComponent(id)}/actions/blueprint`,
      {
        method: "PUT",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          blueprint: [
            {
              transition_id: tid,
              data,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Zoho transitionLead ${response.status}: ${body}`);
    }
  }
}

export const zohoApi = new ZohoApiClient();
