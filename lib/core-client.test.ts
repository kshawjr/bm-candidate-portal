import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { coreConnection } from "./core-client";

const KEYS = ["CORE_IN_FLIGHTDECK", "NEXT_PUBLIC_BMAVE_CORE_URL", "BMAVE_CORE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_FLIGHTDECK_URL", "FLIGHTDECK_SERVICE_ROLE_KEY"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
function setEnv(env: Record<string, string>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
}
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const both = { NEXT_PUBLIC_BMAVE_CORE_URL: "https://core.example", BMAVE_CORE_SERVICE_ROLE_KEY: "core-key", NEXT_PUBLIC_FLIGHTDECK_URL: "https://fd.example", FLIGHTDECK_SERVICE_ROLE_KEY: "fd-key" };

describe("coreConnection", () => {
  it("defaults to bmave-core", () => {
    setEnv(both);
    expect(coreConnection()).toMatchObject({ inFlightDeck: false, url: "https://core.example", serviceRoleKey: "core-key" });
  });
  it("only '1' switches", () => {
    setEnv({ ...both, CORE_IN_FLIGHTDECK: "yes" });
    expect(coreConnection().inFlightDeck).toBe(false);
  });
  it("CORE_IN_FLIGHTDECK=1 uses FlightDeck", () => {
    setEnv({ ...both, CORE_IN_FLIGHTDECK: "1" });
    expect(coreConnection()).toMatchObject({ inFlightDeck: true, url: "https://fd.example", serviceRoleKey: "fd-key" });
  });
});
