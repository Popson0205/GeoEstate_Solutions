"use client";
import { useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import { api, allowanceText, signInUrl, type ReportRow } from "@/lib/client/api";

const day = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function List() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async (query: string) => {
    try { setRows(await api<ReportRow[]>(`/api/reports?q=${encodeURIComponent(query)}`)); setErr(null); } catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { void load(""); }, []);
  return (
    <>
      <form className="page-search" role="search" onSubmit={(e) => { e.preventDefault(); void load(q); }}>
        <label className="sr-only" htmlFor="rq">Search reports</label>
        <input id="rq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Report number, place or your reference" />
        <button className="btn-solid" type="submit">Search</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      {!rows ? <p className="muted">Loading…</p> : !rows.length ? <p className="empty">{q ? "No report matches." : "No reports yet. Click a location on the map and buy its report."}</p> : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Report</th><th>Place</th><th>Reference</th><th className="n">Score</th><th>Bought</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} onClick={() => window.location.assign(`/reports/${r.id}`)} className="is-link">
              <td><a className="mono" href={`/reports/${r.id}`}>{r.number}</a></td><td>{r.place}</td><td>{r.title || <span className="muted">—</span>}</td>
              <td className="n">{r.score ?? "—"}</td><td>{day(r.created_at)}<div className="muted small">{r.created_by_name}</div></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

export default function ReportsPage() {
  return (
    <PageShell title="Your organization's reports">
      {({ me, usage, loading }) => loading ? <p className="muted">Loading…</p> : !me
        ? <div className="card"><p>Sign in with your Geohub account to see your organization's LandCheck reports.</p><a className="btn-solid btn-link" href={signInUrl()}>Sign in</a></div>
        : <>{usage && <p className="muted">{allowanceText(usage)}{me.product ? ` · ${me.product.plan_name}` : ""}</p>}<List /></>}
    </PageShell>
  );
}
