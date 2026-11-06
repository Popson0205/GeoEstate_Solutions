/**
 * Buying, keeping and checking LandCheck reports.
 *
 * Each report is counted against the organization's allowance for the calendar month (Lagos time): the licence's
 * `reports_per_month` limit from Geohub (Standard 50, Advanced 300; none = unlimited). It is numbered per organization
 * (LC-2026-000123), kept exactly as issued, and carries a code anyone can check at /verify/<code>.
 */
import { randomBytes } from "node:crypto";
import type { LandCheckResult } from "@/lib/demo";
import { readyDb, tx } from "./db";
import type { Me } from "./session";

const MONTH = "date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'";

export class ReportError extends Error {
  constructor(message: string, public status: number, public code: string, public extra: Record<string, unknown> = {}) { super(message); }
}

export async function usage(me: Me): Promise<{ used: number; limit: number | null; left: number | null }> {
  const pool = await readyDb();
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM reports WHERE org_id = $1 AND created_at >= ${MONTH}`, [me.org_id]);
  const limit = me.limits.reports_per_month ?? null;
  return { used: rows[0].n, limit, left: limit == null ? null : Math.max(0, limit - rows[0].n) };
}

const code = () => randomBytes(9).toString("base64url").replace(/[-_]/g, "x").slice(0, 12).toUpperCase();

export async function buy(me: Me, lat: number, lng: number, title: string, result: LandCheckResult) {
  return tx(async (c) => {
    // one purchase at a time per organization, so two people cannot both take the last report of the month
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [me.org_id]);
    const limit = me.limits.reports_per_month ?? null;
    if (limit != null) {
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM reports WHERE org_id = $1 AND created_at >= ${MONTH}`, [me.org_id]);
      if (rows[0].n >= limit)
        throw new ReportError(`${me.org_name} has used all ${limit} reports of this month's allowance. More are available on LandCheck Advanced, or from the 1st.`,
          402, "allowance_used", { used: rows[0].n, limit });
    }
    const { rows: s } = await c.query(
      "INSERT INTO settings (org_id, org_name, report_next) VALUES ($1, $2, 2) ON CONFLICT (org_id) DO UPDATE " +
      "SET report_next = settings.report_next + 1, org_name = EXCLUDED.org_name, updated_at = now() RETURNING report_next - 1 AS n",
      [me.org_id, me.org_name ?? ""]);
    const number = `LC-${new Date().getFullYear()}-${String(s[0].n).padStart(6, "0")}`;
    const { rows } = await c.query(
      "INSERT INTO reports (org_id, number, verify_code, lat, lng, place, title, score, result, created_by, created_by_name) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *",
      [me.org_id, number, code(), lat, lng, result.place, title.trim().slice(0, 200), result.score ?? null, JSON.stringify(result), me.id, me.name]);
    return rows[0];
  });
}

export async function list(me: Me, q = "", before?: string) {
  const pool = await readyDb();
  const { rows } = await pool.query(
    "SELECT id, number, place, title, score, lat, lng, created_by_name, created_at FROM reports WHERE org_id = $1 " +
    "AND ($2 = '' OR number ILIKE '%' || $2 || '%' OR place ILIKE '%' || $2 || '%' OR title ILIKE '%' || $2 || '%') " +
    "AND ($3::timestamptz IS NULL OR created_at < $3) ORDER BY created_at DESC LIMIT 100", [me.org_id, q.trim(), before ?? null]);
  return rows;
}

export async function get(me: Me, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const pool = await readyDb();
  const { rows } = await pool.query("SELECT r.*, s.org_name FROM reports r LEFT JOIN settings s ON s.org_id = r.org_id WHERE r.id = $1 AND r.org_id = $2", [id, me.org_id]);
  return rows[0] ?? null;
}

/** What anyone may see about a report from its code: enough to know it is genuine, nothing more. */
export async function verify(code: string) {
  if (!/^[A-Z0-9]{6,16}$/.test(code)) return null;
  const pool = await readyDb();
  const { rows } = await pool.query("SELECT r.number, r.place, r.lat, r.lng, r.score, r.created_at, s.org_name FROM reports r " +
    "LEFT JOIN settings s ON s.org_id = r.org_id WHERE r.verify_code = $1", [code]);
  return rows[0] ?? null;
}

export async function recordBatch(me: Me, n: number) {
  const pool = await readyDb();
  await pool.query("INSERT INTO batch_runs (org_id, rows, by_name) VALUES ($1, $2, $3)", [me.org_id, n, me.name]);
}
