import { describe, expect, it } from "vitest";
import { GeoEstateID, GeoEstateIDError } from "@/lib/server/geoestate-id";
import { fakeGeohub } from "./fake-geohub";

describe("GeoEstate ID (TypeScript kit)", () => {
  it("checks Geohub's tokens with its published key", async () => {
    const hub = await fakeGeohub();
    const c = await hub.client.verify(await hub.token({ role: "member", features: ["reports", "batch"] }));
    expect(c.org?.role).toBe("member");
    expect(c.product?.features).toContain("batch");
    expect(GeoEstateID.canWrite(c)).toBe(true);
    expect(GeoEstateID.canWrite(await hub.client.verify(await hub.token({ status: "expired" })))).toBe(false);
  });

  it("refuses tokens for another app, expired, or not from Geohub", async () => {
    const hub = await fakeGeohub(), other = await fakeGeohub();
    await expect(hub.client.verify(await hub.token({}, { aud: "land" }))).rejects.toBeInstanceOf(GeoEstateIDError);
    await expect(hub.client.verify(await hub.token({}, { exp: Math.floor(Date.now() / 1000) - 10 }))).rejects.toMatchObject({ code: "token_expired" });
    await expect(hub.client.verify(await other.token())).rejects.toThrow(/not valid/);     // same kid, another key
    await expect(hub.client.verify("nonsense")).rejects.toThrow(/not a token/);
  });

  it("builds the sign-in address with PKCE", () => {
    const hub = { client: new GeoEstateID({ geohub: "http://g.test/", api: "http://g.test/api", clientId: "check" }) };
    const v = GeoEstateID.newVerifier();
    const u = new URL(hub.client.authorizeUrl("http://c.test/api/auth/callback", "st", v));
    expect(u.origin + u.pathname).toBe("http://g.test/id/authorize");
    expect(u.searchParams.get("code_challenge")).toBe(GeoEstateID.challenge(v));
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
