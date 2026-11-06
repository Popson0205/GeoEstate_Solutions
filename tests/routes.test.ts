import { NextRequest } from "next/server";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_URL ||= "postgresql://hub:hub@localhost:5432/check_test";
process.env.APP_URL = "http://check.test";
process.env.GEOHUB_URL = "http://geohub.test";

import * as batch from "@/app/api/batch/route";
import * as callback from "@/app/api/auth/callback/route";
import * as signIn from "@/app/api/auth/sign-in/route";
import * as preview from "@/app/api/landcheck/route";
import * as meRoute from "@/app/api/me/route";
import * as one from "@/app/api/reports/[id]/route";
import * as reports from "@/app/api/reports/route";
import * as verify from "@/app/api/verify/[code]/route";
import { middleware } from "@/middleware";
import { buildReportHtml } from "@/lib/report";
import { resetDb } from "@/lib/server/db";
import { setGid } from "@/lib/server/session";
import { fakeGeohub } from "./fake-geohub";

const OSOGBO = { lat: 7.7827, lng: 4.5418 };
let hub: Awaited<ReturnType<typeof fakeGeohub>>;

const req = (path: string, o: { method?: string; body?: unknown; cookies?: Record<string, string>; text?: string; csrf?: boolean } = {}) =>
  new NextRequest(`http://check.test${path}`, {
    method: o.method ?? "GET", body: o.text ?? (o.body ? JSON.stringify(o.body) : undefined),
    headers: { ...(o.cookies ? { cookie: Object.entries(o.cookies).map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...(o.csrf === false ? {} : { "x-geoestate": "1" }) },
  });
async function as(w: Parameters<typeof hub.token>[0] = {}) { return { check_at: await hub.token(w) }; }

beforeAll(async () => {
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  await p.query("DROP SCHEMA IF EXISTS insight CASCADE"); await p.end();
  await resetDb();
});
beforeEach(async () => { hub = await fakeGeohub(); setGid(hub.client); });
afterAll(async () => { await resetDb(); });

describe("signing in through Geohub", () => {
  it("sends people to Geohub and keeps the tokens when they come back", async () => {
    const r = await signIn.GET(req("/api/auth/sign-in?next=/reports"));
    const to = new URL(r.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("http://geohub.test/id/authorize");
    expect(to.searchParams.get("client_id")).toBe("check");
    const state = r.cookies.get("check_state")!.value, pkce = r.cookies.get("check_pkce")!.value;
    const back = await callback.GET(req(`/api/auth/callback?code=good-code&state=${state}`, { cookies: { check_state: state, check_pkce: pkce, check_next: "/reports" } }));
    expect(back.headers.get("location")).toBe("http://check.test/reports");
    expect(back.cookies.get("check_at")?.value).toBeTruthy();
    const wrong = await callback.GET(req("/api/auth/callback?code=good-code&state=other", { cookies: { check_state: state } }));
    expect(wrong.headers.get("location")).toContain("/signed-out?reason=");
  });

  it("refreshes an ended sign-in, and says when the organization has no LandCheck", async () => {
    const t = await hub.tokens({ name: "Kemi" });
    const r = await meRoute.GET(req("/api/me", { cookies: { check_rt: t.refresh_token } }));
    expect((await r.json()).me.name).toBe("Kemi");
    expect(r.cookies.get("check_at")?.value).toBeTruthy();
    const gone = await hub.tokens({ noProduct: true });
    const r2 = await meRoute.GET(req("/api/me", { cookies: { check_rt: gone.refresh_token } }));
    expect(await r2.json()).toMatchObject({ me: null, reason: "Lagos Homes Ltd does not have LandCheck." });
    expect(r2.cookies.get("check_rt")?.value).toBe("");
  });
});

describe("reports", () => {
  it("previews for free, and sells the full report against the month's allowance", async () => {
    const p = await (await preview.GET(req(`/api/landcheck?lat=${OSOGBO.lat}&lng=${OSOGBO.lng}`))).json();
    expect(p).toMatchObject({ preview: true });
    expect(p.score).toBeTypeOf("number");
    expect(p.flood).toBeUndefined();                             // the details are in the report

    expect((await reports.POST(req("/api/reports", { method: "POST", body: OSOGBO }))).status).toBe(401);
    const owner = await as({ limits: { reports_per_month: 2 } });
    const r1 = await reports.POST(req("/api/reports", { method: "POST", body: { ...OSOGBO, title: "Plot 12 for Mr Ade" }, cookies: owner }));
    expect(r1.status).toBe(201);
    const a = await r1.json();
    expect(a.number).toMatch(/^LC-\d{4}-000001$/);
    expect(a.result.flood).toBeTruthy();
    expect(a.title).toBe("Plot 12 for Mr Ade");
    const b = await (await reports.POST(req("/api/reports", { method: "POST", body: OSOGBO, cookies: owner }))).json();
    expect(b.number).toMatch(/000002$/);
    const full = await reports.POST(req("/api/reports", { method: "POST", body: OSOGBO, cookies: owner }));
    expect(full.status).toBe(402);
    expect(await full.json()).toMatchObject({ code: "allowance_used", used: 2, limit: 2 });
    const me = await (await meRoute.GET(req("/api/me", { cookies: owner }))).json();
    expect(me.usage).toEqual({ used: 2, limit: 2, left: 0 });

    // the organization's people read them; another organization cannot
    const viewer = await as({ role: "viewer" });
    expect((await (await reports.GET(req("/api/reports", { cookies: viewer }))).json()).map((x: any) => x.number)).toEqual([b.number, a.number]);
    expect((await (await reports.GET(req("/api/reports?q=mr ade", { cookies: viewer }))).json()).length).toBe(1);
    expect((await reports.POST(req("/api/reports", { method: "POST", body: OSOGBO, cookies: viewer }))).status).toBe(403);
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    expect((await one.GET(req(`/api/reports/${a.id}`, { cookies: viewer }), ctx(a.id))).status).toBe(200);
    const stranger = await as({ org: "22222222-2222-4222-8222-222222222222", limits: { reports_per_month: null } });
    expect((await one.GET(req(`/api/reports/${a.id}`, { cookies: stranger }), ctx(a.id))).status).toBe(404);
    // ...which has its own numbering, and no limit
    expect((await (await reports.POST(req("/api/reports", { method: "POST", body: OSOGBO, cookies: stranger }))).json()).number).toMatch(/000001$/);

    // anyone can check a report is genuine, and see nothing more
    const v = await (await verify.GET(req(`/api/verify/${a.verify_code}`), { params: Promise.resolve({ code: a.verify_code.toLowerCase() }) })).json();
    expect(v).toMatchObject({ genuine: true, number: a.number, org_name: "Lagos Homes Ltd" });
    expect(v.result).toBeUndefined();
    expect((await verify.GET(req("/api/verify/NOPE1234"), { params: Promise.resolve({ code: "NOPE1234" }) })).status).toBe(404);
  });

  it("an ended subscription reads but does not buy; a suspended one is closed", async () => {
    const expired = await as({ org: "33333333-3333-4333-8333-333333333333", status: "expired" });
    expect((await reports.GET(req("/api/reports", { cookies: expired }))).status).toBe(200);
    expect(await (await reports.POST(req("/api/reports", { method: "POST", body: OSOGBO, cookies: expired }))).json()).toMatchObject({ code: "licence_expired" });
    expect((await reports.GET(req("/api/reports", { cookies: await as({ status: "suspended" }) }))).status).toBe(403);
    expect(await (await reports.POST(req("/api/reports", { method: "POST", body: { lat: "x" }, cookies: await as({ org: "44444444-4444-4444-8444-444444444444" }) }))).json()).toMatchObject({ code: "validation" });
  });
});

describe("plan features and safety", () => {
  it("batch checks are part of Advanced", async () => {
    const csv = `name,lat,lng\nA,${OSOGBO.lat},${OSOGBO.lng}\nB,x,y\n`;
    const std = await batch.POST(req("/api/batch", { method: "POST", text: csv, cookies: await as() }));
    expect(await std.json()).toMatchObject({ code: "no_feature" });
    const adv = await batch.POST(req("/api/batch", { method: "POST", text: csv, cookies: await as({ features: ["reports", "batch"] }) }));
    expect(adv.status).toBe(200);
    const out = (await adv.text()).split("\n");
    expect(out[0]).toContain("flood_class");
    expect(out[2]).toContain("invalid coordinates");
  });

  it("Advanced reports carry the title status from Land Registry, as issued", async () => {
    const real = globalThis.fetch;
    const asked: { url: string; key: string | null }[] = [];
    let landUp = true;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith("http://land.test/")) return real(input as any, init);
      asked.push({ url, key: new Headers(init?.headers).get("x-platform-key") });
      if (!landUp) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ checked_at: "2026-11-06T10:00:00Z", registries_searched: 2, near_within_m: 50, near: [],
        at: [{ registry: "Osun Lands Bureau", pin: "OLB-000042", status: "active", area_sqm: 648.2, land_use: "Residential", locality: "Oke-Fia",
          title: { title_no: "OS/CO/0042", kind: "Statutory right of occupancy", starts_on: "2024-03-01", ends_on: null },
          encumbrances: [{ kind: "mortgage", count: 1 }], dealings_pending: 1, holders: null, lookup_url: "https://land.test/lookup/olb?q=OLB-000042" }] }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    process.env.LAND_API = "http://land.test/api"; process.env.LAND_PLATFORM_KEY = "platform-key";
    try {
      const org = "55555555-5555-4555-8555-555555555555";
      // Standard: no title status, Land Registry not asked
      const std = await (await reports.POST(req("/api/reports", { method: "POST", body: OSOGBO, cookies: await as({ org }) }))).json();
      expect(std.result.titleStatus).toBeUndefined();
      expect(asked.length).toBe(0);
      const adv = await as({ org, features: ["reports", "batch", "title_status"] });
      const r = await (await reports.POST(req("/api/reports", { method: "POST", body: OSOGBO, cookies: adv }))).json();
      expect(asked[0]).toEqual({ url: `http://land.test/api/platform/title-status?lat=${OSOGBO.lat}&lng=${OSOGBO.lng}`, key: "platform-key" });
      expect(r.result.titleStatus).toMatchObject({ ok: true, registries_searched: 2, at: [{ pin: "OLB-000042" }] });
      const html = buildReportHtml(r.result);
      expect(html).toContain("OS/CO/0042");
      expect(html).toContain("Mortgage");
      expect(html).toContain("lodged and not yet decided");
      expect(html).toContain("Not published by this registry");
      expect(html).toContain("not proof of title");
      // Land Registry down: the report is still issued, saying so
      landUp = false;
      const down = await reports.POST(req("/api/reports", { method: "POST", body: OSOGBO, cookies: adv }));
      expect(down.status).toBe(201);
      const d = await down.json();
      expect(d.result.titleStatus).toMatchObject({ ok: false });
      expect(buildReportHtml(d.result)).toContain("could not be reached");
    } finally {
      globalThis.fetch = real; delete process.env.LAND_API; delete process.env.LAND_PLATFORM_KEY;
    }
  });

  it("refuses changes that do not come from LandCheck's own pages", () => {
    expect(middleware(req("/api/reports", { method: "POST", body: {}, csrf: false })).status).toBe(403);
    expect(middleware(req("/api/reports", { method: "POST", body: {} })).status).toBe(200);
    expect(middleware(req("/api/reports")).status).toBe(200);
  });
});
