// Proves the request body zohoApi.updateLead sends to Zoho has no
// `trigger` key. In the Zoho API, omitting `trigger` runs workflow rules;
// `trigger: []` would turn them off. fetch is mocked — no real Zoho call.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("ZOHO_REFRESH_TOKEN", "test-refresh");
  vi.stubEnv("ZOHO_CLIENT_ID", "test-client");
  vi.stubEnv("ZOHO_CLIENT_SECRET", "test-secret");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/oauth/v2/token")) {
      return new Response(
        JSON.stringify({ access_token: "fake-token", expires_in: 3600 }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ data: [{ status: "success" }] }), {
      status: 200,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("zohoApi.updateLead", () => {
  it("sends no `trigger` key, so Zoho workflows fire", async () => {
    const { zohoApi } = await import("@/lib/zoho-api");
    await zohoApi.updateLead("123", { FranFunnel_Stage: "Access Portal" });

    const leadCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/crm/v3/Leads/123"),
    );
    expect(leadCall).toBeDefined();
    const body = JSON.parse(leadCall![1].body as string);
    expect(body).toEqual({
      data: [{ id: "123", FranFunnel_Stage: "Access Portal" }],
    });
    expect(body).not.toHaveProperty("trigger");
  });
});
