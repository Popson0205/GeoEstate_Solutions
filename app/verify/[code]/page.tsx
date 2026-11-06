"use client";
import { use, useEffect, useState } from "react";

type V = { genuine: boolean; number?: string; place?: string; lat?: number; lng?: number; score?: number; created_at?: string; org_name?: string; error?: string };

/** Anyone holding a printed LandCheck report can confirm it is genuine. */
export default function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [v, setV] = useState<V | null>(null);
  useEffect(() => { fetch(`/api/verify/${encodeURIComponent(code)}`).then((r) => r.json()).then(setV, () => setV({ genuine: false, error: "Could not check right now." })); }, [code]);
  return (
    <main className="verify">
      <div className="card">
        <img src="/geoestate-logo.png" alt="GeoEstate" width={56} height={56} />
        <h1>LandCheck report check</h1>
        {!v ? <p className="muted">Checking…</p> : v.genuine ? <>
          <p className="ok-line" role="status">This is a genuine GeoEstate LandCheck report.</p>
          <dl className="facts">
            <dt>Report</dt><dd className="mono">{v.number}</dd><dt>Place</dt><dd>{v.place}</dd>
            <dt>Location</dt><dd>{v.lat?.toFixed(5)}, {v.lng?.toFixed(5)}</dd><dt>Score</dt><dd>{v.score ?? "—"}</dd>
            <dt>Issued to</dt><dd>{v.org_name}</dd><dt>Issued</dt><dd>{v.created_at && new Date(v.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</dd>
          </dl>
          <p className="muted small">Compare these with the printed report. The full report stays with the organization that bought it.</p>
        </> : <p className="bad-line" role="alert">{v.error ?? "No LandCheck report has this code."} Check the code on the report, or ask whoever gave it to you.</p>}
        <p className="small muted">Code {code.toUpperCase()}</p>
      </div>
    </main>
  );
}
