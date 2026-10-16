"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Sparkles, X, FileText, Download, Upload, MapPin, Image as ImageIcon, ChevronDown, ChevronUp, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { buildGeoAiReportHtml } from "@/lib/geoai-report-html";
import { makePoster, fetchPosterData, zipStore, downloadBlob, type PosterKind } from "@/lib/poster-client";

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
const EMPTY_FC = { type: "FeatureCollection" as const, features: [] as any[] };
// MapLibre's strict expression/GeoJSON types reject plain object literals; these thin wrappers accept them.
const addLayer = (map: MapLibreMap, layer: any) => map.addLayer(layer);
const addSource = (map: MapLibreMap, id: string, source: any) => map.addSource(id, source);

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
  const [posterMsg, setPosterMsg] = useState<string | null>(null);
  const [posterBusy, setPosterBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [zip, setZip] = useState<{ i: number; n: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const cancelZip = useRef(false);
  const lgaFc = useRef<any | null>(null);

  /* ---- map layers owned by this panel ---- */
  const ensureLayers = useCallback((map: MapLibreMap) => {
    if (!map.getSource("geoai-lga")) addSource(map, "geoai-lga", { type: "geojson", data: lgaFc.current ?? EMPTY_FC });
    if (!map.getLayer("geoai-lga-fill")) addLayer(map, { id: "geoai-lga-fill", type: "fill", source: "geoai-lga", paint: {
      "fill-color": ["interpolate", ["linear"], ["to-number", ["get", "exposureIndex"], 0], 12, "#fff3cd", 20, "#fdbb84", 28, "#e34a33", 36, "#7f0000"], "fill-opacity": 0 } });
    if (!map.getLayer("geoai-lga-line")) addLayer(map, { id: "geoai-lga-line", type: "line", source: "geoai-lga", paint: { "line-color": "#475569", "line-width": 1, "line-opacity": 0.7 } });
    if (!map.getLayer("geoai-lga-selected")) addLayer(map, { id: "geoai-lga-selected", type: "line", source: "geoai-lga", filter: ["==", ["get", "name"], "__none__"], paint: { "line-color": "#0f172a", "line-width": 3 } });
    if (!map.getSource("geoai-pins")) addSource(map, "geoai-pins", { type: "geojson", data: EMPTY_FC });
    if (!map.getLayer("geoai-exposed")) addLayer(map, { id: "geoai-exposed", type: "circle", source: "geoai-pins", paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 14, 8], "circle-color": ["match", ["get", "zone"], "High", "#dc2626", "#f59e0b"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.6 } });
    if (!map.getSource("geoai-safe-src")) addSource(map, "geoai-safe-src", { type: "geojson", data: EMPTY_FC });
    if (!map.getLayer("geoai-safe")) addLayer(map, { id: "geoai-safe", type: "circle", source: "geoai-safe-src", paint: {
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

  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);

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
      if (map.getLayer("geoai-lga-selected")) map.setFilter("geoai-lga-selected", ["==", ["get", "name"], d.scope === "lga" ? d.name : "__none__"] as any);
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
  // Printable posters (JPEG): A2 for print and 1080x1350 for social media, drawn in the browser from /api/poster-data.
  const savePoster = async (kind: PosterKind) => {
    if (!result || result.scope !== "lga" || posterBusy) return;
    setPosterBusy(true); setPosterMsg(`Preparing ${kind === "a2" ? "A2 poster" : "social post"} for ${result.name}…`);
    try { const { blob, name } = await makePoster(result.name, kind); downloadBlob(blob, name); setPosterMsg(`Saved ${name}`); }
    catch (e: any) { setPosterMsg(e?.message || "Could not create the poster."); }
    finally { setPosterBusy(false); }
  };
  const savePosterZip = async () => {
    if (!ranking || posterBusy) return;
    const names: string[] = ranking.map(r => r.name); const files: { name: string; data: Uint8Array }[] = [];
    cancelZip.current = false; setPosterBusy(true); setZip({ i: 0, n: names.length });
    try {
      for (let i = 0; i < names.length; i++) {
        if (cancelZip.current) { setPosterMsg("Stopped. Nothing was saved."); return; }
        setZip({ i, n: names.length }); setPosterMsg(`Poster ${i + 1} of ${names.length}: ${names[i]}…`);
        const data = await fetchPosterData(names[i]);
        for (const kind of ["a2", "social"] as PosterKind[]) { const { blob, name } = await makePoster(names[i], kind, data); files.push({ name: `${kind === "a2" ? "A2_print" : "Social_1080x1350"}/${name}`, data: new Uint8Array(await blob.arrayBuffer()) }); }
      }
      downloadBlob(zipStore(files), "GeoEstate_Osun_LGA_Flood_Posters.zip"); setPosterMsg(`Saved ${names.length} posters (A2 and social) as a ZIP.`);
    } catch (e: any) { setPosterMsg(e?.message || "Could not create the posters. Try again, or make them one LGA at a time."); }
    finally { setPosterBusy(false); setZip(null); }
  };
  const exportRanking = () => ranking && download("osun-lga-flood-exposure-ranking.csv", ["rank,lga,area_km2,high_zone_pct,moderate_zone_pct,mean_slope_deg,schools_exposed,schools_total,health_exposed,health_total,markets_exposed,markets_total,road_km_exposed,road_km_total,exposure_index",
    ...ranking.map(r => [r.rank, r.name, r.areaKm2, r.exposedPct, r.moderatePct, r.meanSlopeDeg, r.schoolsExposed, r.schoolsTotal, r.healthExposed, r.healthTotal, r.marketsExposed, r.marketsTotal, r.roadKmExposed, r.roadKmTotal, r.exposureIndex].map(csvCell).join(","))].join("\n"));

  async function onBatch(file: File | undefined) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") { setBatchMsg("Please choose a .csv file with latitude and longitude columns."); return; }
    setBatchMsg("Checking your plots…");
    try {
      const r = await fetch("/api/batch", { method: "POST", headers: { "content-type": "text/csv" }, body: await file.text() });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Batch check failed"); }
      download(file.name.replace(/\.csv$/i, "") + "-geoestate.csv", await r.text()); setBatchMsg("Done. Results downloaded.");
    } catch (e) { setBatchMsg((e as Error).message); }
  }

  const f = result?.flood, a = result?.assets;
  const isLga = result?.scope === "lga";
  const lowPct = f ? Math.max(0, Math.round((100 - f.exposedPct - f.moderatePct) * 10) / 10) : 0;
  const maxIdx = ranking ? Math.max(...ranking.map((r: any) => r.exposureIndex), 1) : 1;
  const showEmpty = tab === "analysis" && !result && !error && !loading;
  const rowKey = (e: React.KeyboardEvent, name: string) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); run(name); } };

  return (
    <div className={`geoai-panel${collapsed ? " collapsed" : ""}`} role="dialog" aria-label="GeoAI flood exposure">
      <div className="geoai-head">
        <div>
          <span className="geoai-eyebrow"><Sparkles size={13}/> GeoAI</span>
          <h2 className="geoai-h">Flood exposure analysis</h2>
        </div>
        <div className="geoai-head-actions">
          <button className="close-btn" onClick={() => setCollapsed(c => !c)} aria-expanded={!collapsed} aria-label={collapsed ? "Expand GeoAI panel" : "Collapse GeoAI panel"}>{collapsed ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</button>
          <button className="close-btn" onClick={onClose} aria-label="Close GeoAI"><X size={16}/></button>
        </div>
      </div>

      {!collapsed && <div className="geoai-body">
        <label className="geoai-label" htmlFor="geoai-scope">Area to analyse</label>
        <div className="geoai-row">
          <select id="geoai-scope" value={scope} onChange={e => setScope(e.target.value)}>
            <option value={VIEW}>Current map view</option>
            {lgas.map(n => <option key={n} value={n}>{n} LGA</option>)}
          </select>
          <button className="geoai-go" disabled={loading} onClick={() => run()}>
            {loading ? <><Loader2 size={15} className="geoai-spin"/> Analysing…</> : "Analyse"}
          </button>
        </div>

        <label className="geoai-switch">
          <input type="checkbox" role="switch" checked={choro} onChange={e => setChoro(e.target.checked)}/>
          <span className="geoai-switch-track" aria-hidden="true"/>
          <span>Shade LGAs by exposure</span>
        </label>
        {choro && <div className="geoai-ramp" aria-hidden="true"><span>Lower</span><i/><span>Higher exposure</span></div>}

        <div className="geoai-tabs" role="tablist" aria-label="GeoAI views">
          <button role="tab" aria-selected={tab === "analysis"} className={tab === "analysis" ? "on" : ""} onClick={() => setTab("analysis")}>Area report</button>
          <button role="tab" aria-selected={tab === "ranking"} className={tab === "ranking" ? "on" : ""} onClick={() => setTab("ranking")}>All LGAs ranked</button>
        </div>

        {error && (
          <div className="geoai-error" role="alert">
            <AlertTriangle size={16}/>
            <div><strong>The analysis didn't finish</strong><span>{error}</span></div>
            <button onClick={() => run()}><RefreshCw size={13}/> Try again</button>
          </div>
        )}

        {showEmpty && (
          <div className="geoai-empty">
            <strong>Pick an area, then press Analyse</strong>
            <p>You'll see how much of it sits in flood-susceptible zones, which facilities are affected, and safer places to build. Pins on the map:</p>
            <ul className="geoai-key">
              <li><i style={{ background: "#dc2626" }}/> Facility in a High zone</li>
              <li><i style={{ background: "#f59e0b" }}/> Facility in a Moderate zone</li>
              <li><i style={{ background: "#16a34a" }}/> Candidate site on safer ground</li>
            </ul>
          </div>
        )}

        {tab === "analysis" && loading && (
          <div className="geoai-skeletons" aria-busy="true" aria-label="Analysing">
            <div className="sk" style={{ height: 22, width: "55%" }}/><div className="sk" style={{ height: 64 }}/><div className="sk" style={{ height: 90 }}/><div className="sk" style={{ height: 70 }}/>
          </div>
        )}

        {tab === "analysis" && result && !loading && (
          <div className="geoai-result">
            <div className="geoai-title">
              <h3>{result.name}{isLga ? " LGA" : ""}</h3>
              <div className="geoai-meta">
                <span>{result.areaKm2} km²</span>
                {result.rank && <span className="geoai-badge" title="Rank 1 = highest exposure index of all 30 LGAs">Exposure rank {result.rank.position} of {result.rank.of}</span>}
              </div>
            </div>

            <div className="geoai-kpis">
              <div className="k-high"><label>High zone</label><strong>{f.exposedPct}%</strong></div>
              <div className="k-mod"><label>Moderate</label><strong>{f.moderatePct}%</strong></div>
              <div><label>Mean slope</label><strong>{result.terrain.meanSlopeDeg ?? "–"}°</strong></div>
              <div><label>Roads in High</label><strong>{result.roads.exposedKm} km</strong></div>
            </div>
            <div className="geoai-zonebar" role="img" aria-label={`Area by zone: ${f.exposedPct}% High, ${f.moderatePct}% Moderate, ${lowPct}% lower`}>
              <i style={{ width: `${f.exposedPct}%`, background: "#dc2626" }}/><i style={{ width: `${f.moderatePct}%`, background: "#f59e0b" }}/><i style={{ width: `${lowPct}%`, background: "#86c9a0" }}/>
            </div>
            <div className="geoai-zonelegend"><span><i style={{ background: "#dc2626" }}/>High {f.exposedPct}%</span><span><i style={{ background: "#f59e0b" }}/>Moderate {f.moderatePct}%</span><span><i style={{ background: "#86c9a0" }}/>Lower {lowPct}%</span></div>

            <h4 className="geoai-sub">Facilities on record</h4>
            <table className="geoai-table"><thead><tr><th scope="col">Type</th><th scope="col">In area</th><th scope="col">In High</th><th scope="col">In Mod.</th></tr></thead><tbody>
              {([["Schools", a.schools], ["Health facilities", a.health], ["Markets", a.markets]] as [string, any][]).map(([l, x]) => <tr key={l}><th scope="row">{l}</th><td>{x.total}</td><td className={x.high ? "hot" : ""}>{x.high}</td><td>{x.moderate}</td></tr>)}
            </tbody></table>
            <p className="geoai-hint">Counts show what is on record today. A zero can mean the data is missing, not that nothing is there.</p>

            <h4 className="geoai-sub">Summary <span className="geoai-tag">{result.narrative?.source === "ai" ? "AI-worded from the figures" : "Standard template"}</span></h4>
            <div className="geoai-text">{String(result.narrative?.text || "").split(/\n+/).map((l: string, i: number) => <p key={i}>{l}</p>)}</div>

            {result.exposedAssets.highCount > 0 && <>
              <h4 className="geoai-sub">Facilities in High zones ({result.exposedAssets.highCount})</h4>
              <div className="geoai-list">{result.exposedAssets.high.slice(0, 12).map((x: any, i: number) => (
                <button key={i} onClick={() => fly(x.lon, x.lat)} aria-label={`Zoom to ${x.name}`}><MapPin size={13} color="#dc2626"/><span>{x.name}</span><em>{TYPE_LABEL[x.type]}</em></button>))}</div>
              {result.exposedAssets.highCount > 12 && <p className="geoai-hint">Showing 12 of {result.exposedAssets.highCount}. The CSV has them all.</p>}
            </>}
            {result.safeSites.length > 0 && <>
              <h4 className="geoai-sub">Candidate sites on safer ground ({result.safeSites.length})</h4>
              <div className="geoai-list">{result.safeSites.map((s: any, i: number) => (
                <button key={i} onClick={() => fly(s.lon, s.lat)} aria-label={`Zoom to ${s.name}`}><MapPin size={13} color="#16a34a"/><span>{s.name}</span><em>{s.meanSlopeDeg}° · road {s.nearestRoadKm} km</em></button>))}</div>
            </>}

            <div className="geoai-group">
              <h4 className="geoai-sub">Report and data</h4>
              <div className="geoai-actions">
                <button className="primary" onClick={openReport}><FileText size={14}/> Briefing report</button>
                <button onClick={exportExposed}><Download size={14}/> Exposed facilities CSV</button>
              </div>
            </div>
            <div className="geoai-group">
              <h4 className="geoai-sub">Print and share</h4>
              {isLga ? (
                <div className="geoai-actions">
                  <button onClick={() => savePoster("a2")} disabled={posterBusy}><ImageIcon size={14}/> Poster A2 (JPEG)</button>
                  <button onClick={() => savePoster("social")} disabled={posterBusy}><ImageIcon size={14}/> Social post (JPEG)</button>
                </div>
              ) : <p className="geoai-hint">Posters are made for a single LGA. Choose an LGA above and analyse it.</p>}
              {posterMsg && <p className="geoai-status" role="status">{posterBusy && <Loader2 size={13} className="geoai-spin"/>}{posterMsg}</p>}
            </div>
          </div>
        )}

        {tab === "ranking" && (ranking ? (
          <div>
            <p className="geoai-hint" style={{ marginTop: 0 }}>Rank 1 has the highest exposure index. Select a row to open that LGA.</p>
            <div className="geoai-scroll"><table className="geoai-table rank"><thead><tr><th scope="col">#</th><th scope="col">LGA</th><th scope="col">High %</th><th scope="col">Health</th><th scope="col">Index</th></tr></thead><tbody>
              {ranking.map(r => (
                <tr key={r.name} className={`click${result?.name === r.name ? " cur" : ""}`} tabIndex={0} onClick={() => run(r.name)} onKeyDown={e => rowKey(e, r.name)} aria-label={`${r.name}, rank ${r.rank}, exposure index ${r.exposureIndex}. Open this LGA`}>
                  <td>{r.rank}</td><td>{r.name}</td><td>{r.exposedPct}</td><td>{r.healthExposed}/{r.healthTotal}</td>
                  <td><div className="geoai-idx"><i style={{ width: `${(r.exposureIndex / maxIdx) * 100}%` }}/><b>{r.exposureIndex}</b></div></td>
                </tr>))}
            </tbody></table></div>
            <p className="geoai-hint">Index = 40% area in High zones + 40% facilities in High zones + 20% roads in High zones.</p>
            <div className="geoai-actions">
              <button onClick={exportRanking}><Download size={14}/> Ranking CSV</button>
              <button onClick={savePosterZip} disabled={posterBusy}><ImageIcon size={14}/> All {ranking.length} LGA posters (ZIP)</button>
            </div>
            {zip && (
              <div className="geoai-progress">
                <div className="geoai-bar" role="progressbar" aria-valuemin={0} aria-valuemax={zip.n} aria-valuenow={zip.i}><i style={{ width: `${(zip.i / zip.n) * 100}%` }}/></div>
                <button onClick={() => { cancelZip.current = true; }}>Stop</button>
              </div>
            )}
            {posterMsg && <p className="geoai-status" role="status">{posterBusy && <Loader2 size={13} className="geoai-spin"/>}{posterMsg}</p>}
          </div>) : (error ? null : <div className="geoai-skeletons" aria-busy="true"><div className="sk" style={{ height: 36 }}/><div className="sk" style={{ height: 36 }}/><div className="sk" style={{ height: 36 }}/></div>))}

        <div className="geoai-batch">
          <h4 className="geoai-sub" style={{ marginTop: 0 }}>Check a list of plots</h4>
          <p className="geoai-hint" style={{ margin: "2px 0 8px" }}>Upload a CSV with latitude and longitude columns (up to 2,000 rows). You get it back with LGA, flood class, slope and land cover added.</p>
          <label className={`geoai-drop${dragOver ? " over" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); onBatch(e.dataTransfer.files?.[0]); }}>
            <Upload size={16}/><span><strong>Choose a CSV</strong> or drop it here</span>
            <input type="file" accept=".csv,text/csv" onChange={e => { onBatch(e.target.files?.[0]); e.target.value = ""; }}/>
          </label>
          {batchMsg && <p className="geoai-status" role="status">{batchMsg}</p>}
        </div>
      </div>}
    </div>
  );
}
