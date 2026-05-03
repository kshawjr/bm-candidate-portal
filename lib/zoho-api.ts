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
    const token = await this.getAccessToken();
    const response = await fetch(
      `https://www.zohoapis.com/crm/v3/Leads/${encodeURIComponent(leadId)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: [fields] }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Zoho updateLead ${response.status}: ${body}`);
    }
  }
}

export const zohoApi = new ZohoApiClient();
