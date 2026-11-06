"use client";
import { useCallback, useEffect, useState } from "react";

export type Me = {
  id: string; name: string; email: string; org_id: string | null; org_name: string | null; org_role: string | null; staff_role: string | null;
  product: { plan_name: string; status: string; status_name: string; subscription_ends: string | null; grace_ends: string | null; features: string[];
    limits: Record<string, number | null> } | null;
  features: string[]; can_write: boolean; can_buy: boolean;
};
export type Usage = { used: number; limit: number | null; left: number | null };
export type AppTile = { product: string; name: string; status: string; status_name: string; url: string | null; current: boolean };
export type ReportRow = { id: string; number: string; place: string; title: string; score: number | null; lat: number; lng: number; created_by_name: string; created_at: string };
export type Report = ReportRow & { verify_code: string; result: any; org_name: string | null };

export class ApiError extends Error { constructor(m: string, public status: number, public code?: string, public body?: any) { super(m); } }

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, { ...init, credentials: "same-origin",
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), "x-geoestate": "1", ...(init.headers || {}) } });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(b.error || `LandCheck answered ${r.status}`, r.status, b.code, b);
  return b as T;
}

export const signInUrl = (next?: string) =>
  `/api/auth/sign-in?next=${encodeURIComponent(next ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/"))}`;

/** The signed-in person (null when not signed in), their organization's allowance, and a reload. */
export function useMe() {
  const [state, setState] = useState<{ loading: boolean; me: Me | null; usage: Usage | null; reason: string | null }>({ loading: true, me: null, usage: null, reason: null });
  const load = useCallback(async () => {
    try { const d = await api<{ me: Me | null; usage?: Usage | null; reason?: string | null }>("/api/me"); setState({ loading: false, me: d.me, usage: d.usage ?? null, reason: d.reason ?? null }); }
    catch { setState({ loading: false, me: null, usage: null, reason: null }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { ...state, reload: load };
}

const longDay = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
export function licenceNotice(me: Me | null): { tone: "info" | "warn" | "bad"; text: string } | null {
  const p = me?.product; if (!p) return null;
  if (p.status === "expired") return { tone: "bad", text: "Your organization's LandCheck subscription has ended, so it is read-only: you can open past reports but not buy new ones. Renew with GeoEstate NIG Limited." };
  if (p.status === "grace") return { tone: "warn", text: `Your organization's LandCheck subscription ended on ${longDay(p.subscription_ends)}. Reports can still be bought until ${longDay(p.grace_ends)}. Renew with GeoEstate NIG Limited.` };
  if (p.status === "demo") return { tone: "info", text: `You are on a LandCheck demo until ${longDay(p.subscription_ends)}. Ask GeoEstate NIG Limited for an invoice to keep using it.` };
  return null;
}
export const allowanceText = (u: Usage | null) => (!u ? "" : u.limit == null ? `${u.used} reports this month` : `${u.left} of ${u.limit} reports left this month`);
