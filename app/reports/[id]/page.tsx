"use client";
import { use, useEffect, useMemo, useState } from "react";
import PageShell from "@/components/PageShell";
import { api, signInUrl, type Report } from "@/lib/client/api";
import { buildReportHtml } from "@/lib/report";

function Show({ id }: { id: string }) {
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<Report>(`/api/reports/${id}`).then(setR, (e) => setErr(e.message)); }, [id]);
  const html = useMemo(() => r && buildReportHtml(r.result, { number: r.number, orgName: r.org_name ?? "", title: r.title, issuedAt: r.created_at,
    issuedBy: r.created_by_name, verifyCode: r.verify_code, verifyUrl: `${window.location.origin}/verify/${r.verify_code}` }), [r]);
  if (err) return <p className="error" role="alert">{err}</p>;
  if (!r || !html) return <p className="muted">Loading…</p>;
  const print = () => { const w = window.open("", "_blank"); if (!w) return; w.document.open(); w.document.write(html); w.document.close(); };
  const shown = html.replace(/<button onclick="window.print\(\)">[^<]*<\/button>/, "");     // the page has its own button
  return (
    <>
      <div className="page-actions"><a href="/reports">All reports</a><a href={`/?lat=${r.lat}&lng=${r.lng}`}>On the map</a>
        <button className="btn-solid" onClick={print}>Print or save as PDF</button></div>
      <iframe className="report-frame" title={`Report ${r.number}`} srcDoc={shown} />
    </>
  );
}

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <PageShell>
      {({ me, loading }) => loading ? <p className="muted">Loading…</p> : !me
        ? <div className="card"><p>Sign in to open this report.</p><a className="btn-solid btn-link" href={signInUrl()}>Sign in</a></div> : <Show id={id} />}
    </PageShell>
  );
}
