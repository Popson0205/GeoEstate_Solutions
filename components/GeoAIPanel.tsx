"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Sparkles, X, FileText, Download, Upload, MapPin } from "lucide-react";
import { buildGeoAiReportHtml } from "@/lib/geoai-report-html";

// GeoAI: flood-exposure analysis for an LGA or the current map view, with pins, LGA ranking, a printable briefing and batch CSV checks.
// All figures come from /api/analyse (the project's own flood, slope and facility data); the AI only words the summary.
type Props = { getMap: () => MapLibreMap | null; onClose: () => void; notify: (msg: string | null) => void };
const VIEW = "__view";
const TYPE_LABEL: Record<string, string> = { school: "School", health: "Health facility", market: "Market" };
const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function download(name: string, text: string, mime = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const EMPTY_FC = { type: "FeatureCollection", features: [] as any[] };

export default function GeoAIPanel({ getMap, onClose, notify }: Props) {
  const [lgas, setLgas] = useState<string[]>([]);
  const [ranking, setRanking] = useState<any[] | null>(null);
  const [scope, setScope] = useState<string>("Osogbo");
  const [tab, setTab] = useState<"analysis" | "ranking">("analysis");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [choro, setChoro] = useState(true);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);
  const lgaFc = useRef<any | null>(null);

  /* ---- map layers owned by this panel ---- */
  const ensureLayers = useCallback((map: MapLibreMap) => {
    if (!map.getSource("geoai-lga")) map.addSource("geoai-lga", { type: "geojson", data: lgaFc.current ?? EMPTY_FC });
    if (!map.getLayer("geoai-lga-fill")) map.addLayer({ id: "geoai-lga-fill", type: "fill", source: "geoai-lga", paint: {
      "fill-color": ["interpolate", ["linear"], ["to-number", ["get", "exposureIndex"], 0], 12, "#fff3cd", 20, "#fdbb84", 28, "#e34a33", 36, "#7f0000"], "fill-opacity": 0 } });
    if (!map.getLayer("geoai-lga-line")) map.addLayer({ id: "geoai-lga-line", type: "line", source: "geoai-lga", paint: { "line-color": "#475569", "line-width": 1, "line-opacity": 0.7 } });
    if (!map.getLayer("geoai-lga-selected")) map.addLayer({ id: "geoai-lga-selected", type: "line", source: "geoai-lga", filter: ["==", ["get", "name"], "__none__"], paint: { "line-color": "#0f172a", "line-width": 3 } });
    if (!map.getSource("geoai-pins")) map.addSource("geoai-pins", { type: "geojson", data: EMPTY_FC });
    if (!map.getLayer("geoai-exposed")) map.addLayer({ id: "geoai-exposed", type: "circle", source: "geoai-pins", paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 14, 8], "circle-color": ["match", ["get", "zone"], "High", "#dc2626", "#f59e0b"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.6 } });
    if (!map.getSource("geoai-safe-src")) map.addSource("geoai-safe-src", { type: "geojson", data: EMPTY_FC });
    if (!map.getLayer("geoai-safe")) map.addLayer({ id: "geoai-safe", type: "circle", source: "geoai-safe-src", paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 10], "circle-color": "#16a34a", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
  }, []);

  useEffect(() => {
    const map = getMap(); if (!map) return;
    let cancelled = false;
    const start = async () => {
      try {
        const [g, r] = await Promise.all([fetch("/lga-osun.geojson").then(x => x.json()), fetch("/api/analyse?rank=1").then(async x => { const b = await x.json(); if (!x.ok) throw new Error(b.error || "Ranking unavailable"); return b; })]);
        if (cancelled) return;
        const byName = new Map<string, any>(r.ranking.map((x: any) => [x.name, x]));
        g.features.forEach((f: any) => { const m = byName.get(f.properties.name); if (m) { f.properties.exposureIndex = m.exposureIndex; f.properties.rank = m.rank; } });
        lgaFc.current = g; setRanking(r.ranking); setLgas(r.lgas);
        ensureLayers(map); (map.getSource("geoai-lga") as any)?.setData(g);
      } catch (e) { if (!cancelled) setError((e as Error).message || "Could not load GeoAI data."); }
    };
    if (map.isStyleLoaded()) start(); else map.once("load", start);
    return () => {
      cancelled = true;
      for (const id of ["geoai-safe", "geoai-exposed", "geoai-lga-selected", "geoai-lga-line", "geoai-lga-fill"]) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of ["geoai-safe-src", "geoai-pins", "geoai-lga"]) if (map.getSource(id)) map.removeSource(id);
    };
  }, [getMap, ensureLayers]);

  useEffect(() => { const m = getMap(); if (m?.getLayer("geoai-lga-fill")) m.setPaintProperty("geoai-lga-fill", "fill-opacity", choro ? 0.42 : 0); }, [choro, ranking, getMap]);

  /* ---- run an analysis ---- */
  async function run(which: string = scope) {
    const map = getMap(); if (!map) return;
    setLoading(true); setError(null); notify(null);
    try {
      const b = map.getBounds();
      const url = which === VIEW ? `/api/analyse?bbox=${[b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(v => v.toFixed(5)).join(",")}` : `/api/analyse?lga=${encodeURIComponent(which)}`;
      const r = await fetch(url); const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Analysis failed");
      setResult(d); setScope(which); setTab("analysis");
      ensureLayers(map);
      const pins = [...d.exposedAssets.high, ...d.exposedAssets.moderate].map((x: any) => ({ type: "Feature", geometry: { type: "Point", coordinates: [x.lon, x.lat] }, properties: { type: x.type, name: x.name, level: x.level, zone: x.zone, lga: x.lga } }));
      (map.getSource("geoai-pins") as any)?.setData({ type: "FeatureCollection", features: pins });
      (map.getSource("geoai-safe-src") as any)?.setData({ type: "FeatureCollection", features: d.safeSites.map((s: any) => ({ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: s })) });
      if (map.getLayer("geoai-lga-selected")) map.setFilter("geoai-lga-selected", ["==", ["get", "name"], d.scope === "lga" ? d.name : "__none__"]);
      if (d.scope === "lga") map.fitBounds([[d.bbox[0], d.bbox[1]], [d.bbox[2], d.bbox[3]]], { padding: { top: 70, bottom: 40, left: 420, right: 60 }, duration: 900 });
    } catch (e) { setError((e as Error).message); setResult(null); }
    setLoading(false);
  }

  const fly = (lon: number, lat: number) => getMap()?.flyTo({ center: [lon, lat], zoom: 15, duration: 800 });
  const openReport = () => {
    const w = window.open("", "_blank");
    if (!w) { notify("Your browser blocked the report window. Allow pop-ups for this site and try again."); return; }
    w.document.open(); w.document.write(buildGeoAiReportHtml(result, ranking)); w.document.close();
  };
  const exportExposed = () => {
    const rows = [...result.exposedAssets.high, ...result.exposedAssets.moderate];
    download(`exposed-facilities-${result.name.replace(/\W+/g, "-")}.csv`, ["name,type,level,zone,lga,lat,lon", ...rows.map((x: any) => [x.name, TYPE_LABEL[x.type] || x.type, x.level, x.zone, x.lga, x.lat, x.lon].map(csvCell).join(","))].join("\n"));
  };
  const exportRanking = () => ranking && download("osun-lga-flood-exposure-ranking.csv", ["rank,lga,area_km2,high_zone_pct,moderate_zone_pct,mean_slope_deg,schools_exposed,schools_total,health_exposed,health_total,markets_exposed,markets_total,road_km_exposed,road_km_total,exposure_index",
    ...ranking.map(r => [r.rank, r.name, r.areaKm2, r.exposedPct, r.moderatePct, r.meanSlopeDeg, r.schoolsExposed, r.schoolsTotal, r.healthExposed, r.healthTotal, r.marketsExposed, r.marketsTotal, r.roadKmExposed, r.roadKmTotal, r.exposureIndex].map(csvCell).join(","))].join("\n"));

  async function onBatch(file: File | undefined) {
    if (!file) return; setBatchMsg("Checking…");
    try {
      const r = await fetch("/api/batch", { method: "POST", headers: { "content-type": "text/csv" }, body: await file.text() });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Batch check failed"); }
      download(file.name.replace(/\.csv$/i, "") + "-geoestate.csv", await r.text()); setBatchMsg("Done. Results downloaded.");
    } catch (e) { setBatchMsg((e as Error).message); }
  }

  const f = result?.flood, a = result?.assets;
  return (
    <div className="geoai-panel" role="dialog" aria-label="GeoAI flood exposure">
      <div className="geoai-head">
        <div><div className="card-eyebrow"><Sparkles size={11} style={{ verticalAlign: -1 }}/> GeoAI</div><div className="card-title" style={{ fontSize: 16 }}>Flood exposure analysis</div></div>
        <button className="close-btn" onClick={onClose} aria-label="Close GeoAI"><X size={15}/></button>
      </div>

      <div className="geoai-row">
        <select value={scope} onChange={e => setScope(e.target.value)} aria-label="Area to analyse">
          <option value={VIEW}>Current map view</option>
          {lgas.map(n => <option key={n} value={n}>{n} LGA</option>)}
        </select>
        <button className="primary-btn" style={{ padding: "0 14px", height: 36 }} disabled={loading} onClick={() => run()}>{loading ? "Analysing…" : "Analyse"}</button>
      </div>
      <label className="geoai-check"><input type="checkbox" checked={choro} onChange={e => setChoro(e.target.checked)}/> Colour LGAs by exposure</label>

      <div className="geoai-tabs">
        <button className={tab === "analysis" ? "on" : ""} onClick={() => setTab("analysis")}>Area report</button>
        <button className={tab === "ranking" ? "on" : ""} onClick={() => setTab("ranking")}>All LGAs ranked</button>
      </div>

      {error && <div className="geoai-error">{error}</div>}

      {tab === "analysis" && !result && !error && <p className="geoai-hint">Choose an LGA (or zoom the map to an area) and press Analyse. Pins show facilities in flood-susceptible zones (red = High, amber = Moderate) and candidate sites on safer ground (green).</p>}

      {tab === "analysis" && result && (
        <div>
          <div className="geoai-title">{result.name}{result.scope === "lga" ? " LGA" : ""} <span>{result.areaKm2} km²{result.rank ? ` · exposure rank ${result.rank.position}/${result.rank.of}` : ""}</span></div>
          <div className="geoai-kpis">
            <div><label>High zone</label><strong>{f.exposedPct}%</strong></div>
            <div><label>Moderate</label><strong>{f.moderatePct}%</strong></div>
            <div><label>Mean slope</label><strong>{result.terrain.meanSlopeDeg ?? "–"}°</strong></div>
            <div><label>Roads in High</label><strong>{result.roads.exposedKm} km</strong></div>
          </div>
          <table className="geoai-table"><thead><tr><th></th><th>In area</th><th>High</th><th>Mod.</th></tr></thead><tbody>
            {([["Schools", a.schools], ["Health facilities", a.health], ["Markets", a.markets]] as [string, any][]).map(([l, x]) => <tr key={l}><td>{l}</td><td>{x.total}</td><td className={x.high ? "hot" : ""}>{x.high}</td><td>{x.moderate}</td></tr>)}
          </tbody></table>

          <div className="geoai-sub">Summary <span className="geoai-tag">{result.narrative?.source === "ai" ? "AI-written from the figures" : "Standard template"}</span></div>
          <div className="geoai-text">{String(result.narrative?.text || "").split(/\n+/).map((l: string, i: number) => <p key={i}>{l}</p>)}</div>

          {result.exposedAssets.highCount > 0 && <>
            <div className="geoai-sub">Facilities in High zones ({result.exposedAssets.highCount})</div>
            <div className="geoai-list">{result.exposedAssets.high.slice(0, 12).map((x: any, i: number) => (
              <button key={i} onClick={() => fly(x.lon, x.lat)}><MapPin size={12} color="#dc2626"/><span>{x.name}</span><em>{TYPE_LABEL[x.type]}</em></button>))}</div>
          </>}
          {result.safeSites.length > 0 && <>
            <div className="geoai-sub">Candidate sites on safer ground ({result.safeSites.length})</div>
            <div className="geoai-list">{result.safeSites.map((s: any, i: number) => (
              <button key={i} onClick={() => fly(s.lon, s.lat)}><MapPin size={12} color="#16a34a"/><span>{s.name}</span><em>{s.meanSlopeDeg}° · road {s.nearestRoadKm} km</em></button>))}</div>
          </>}
          <div className="geoai-actions">
            <button onClick={openReport}><FileText size={13}/> Briefing report</button>
            <button onClick={exportExposed}><Download size={13}/> Exposed facilities CSV</button>
          </div>
        </div>
      )}

      {tab === "ranking" && (ranking ? (
        <div>
          <div className="geoai-scroll"><table className="geoai-table"><thead><tr><th>#</th><th>LGA</th><th>High %</th><th>Health</th><th>Roads km</th><th>Index</th></tr></thead><tbody>
            {ranking.map(r => <tr key={r.name} className="click" onClick={() => run(r.name)}><td>{r.rank}</td><td>{r.name}</td><td>{r.exposedPct}</td><td>{r.healthExposed}/{r.healthTotal}</td><td>{r.roadKmExposed}</td><td><b>{r.exposureIndex}</b></td></tr>)}
          </tbody></table></div>
          <p className="geoai-hint">Index = 40% area in High zones + 40% facilities in High zones + 20% roads in High zones. Click a row to open that LGA.</p>
          <div className="geoai-actions"><button onClick={exportRanking}><Download size={13}/> Ranking CSV</button></div>
        </div>) : <p className="geoai-hint">Loading ranking…</p>)}

      <div className="geoai-batch">
        <div className="geoai-sub" style={{ marginTop: 0 }}>Batch check a list of plots</div>
        <p className="geoai-hint" style={{ margin: "2px 0 6px" }}>Upload a CSV with latitude and longitude columns (up to 2,000 rows). You get it back with LGA, flood class, slope and land cover added.</p>
        <label className="geoai-upload"><Upload size={13}/> Choose CSV<input type="file" accept=".csv,text/csv" onChange={e => { onBatch(e.target.files?.[0]); e.target.value = ""; }}/></label>
        {batchMsg && <span className="geoai-hint" style={{ marginLeft: 8 }}>{batchMsg}</span>}
      </div>
    </div>
  );
}
