/**
 * LandCheck's tables live in Geohub's PostgreSQL, in the `insight` schema (the platform's one-database rule).
 * Migrations are the numbered files in migrations/, applied once each, in order, under an advisory lock.
 */
import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { config } from "./config";

const SCHEMA = "insight";
let pool: Pool | null = null;
let ready: Promise<void> | null = null;

export function db(): Pool {
  if (!pool) {
    const url = config.databaseUrl();
    if (!url) throw new Error("DATABASE_URL is not set: LandCheck keeps its reports in Geohub's database.");
    pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL || 5), options: `-c search_path=${SCHEMA},public` });
  }
  return pool;
}

async function migrate(): Promise<void> {
  const c = await db().connect();
  try {
    await c.query("SELECT pg_advisory_lock(727272)");
    await c.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    await c.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await c.query(`SELECT name FROM ${SCHEMA}.migrations`)).rows.map((r) => r.name));
    const dir = path.join(process.cwd(), "migrations");
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      if (done.has(f)) continue;
      await c.query("BEGIN");
      try {
        await c.query(fs.readFileSync(path.join(dir, f), "utf8"));
        await c.query(`INSERT INTO ${SCHEMA}.migrations (name) VALUES ($1)`, [f]);
        await c.query("COMMIT");
        console.info(`LandCheck: applied migration ${f}`);
      } catch (e) { await c.query("ROLLBACK"); throw e; }
    }
  } finally {
    await c.query("SELECT pg_advisory_unlock(727272)").catch(() => undefined);
    c.release();
  }
}

/** The pool, once the schema is up to date. */
export async function readyDb(): Promise<Pool> {
  if (!ready) ready = migrate().catch((e) => { ready = null; throw e; });
  await ready;
  return db();
}

export async function tx<T>(f: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await (await readyDb()).connect();
  try {
    await c.query("BEGIN");
    const out = await f(c);
    await c.query("COMMIT");
    return out;
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

/** Tests: start from a clean pool (another DATABASE_URL). */
export async function resetDb() { await pool?.end(); pool = null; ready = null; }
