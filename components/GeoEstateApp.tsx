"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import {
  Search, MapPin, Layers3, Building2, GraduationCap, Hospital,
  Route, ShoppingBag, Landmark, Droplets, Trees, X, FileText,
  Crosshair, Menu, ChevronRight
} from "lucide-react";
import type { LandCheckResult } from "@/lib/demo";
import { buildReportHtml } from "@/lib/report";

const VECTOR_LAYER_IDS = ["roads", "properties", "schools", "hospitals", "markets", "government", "flood", "landcover"];

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors"
    }
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }]
} as any;

function addProviderLayers(map: MapLibreMap, data: any) {
  const groups = ["roads", "properties", "schools", "hospitals", "markets", "government", "flood"] as const;
  for (const id of groups) {
    if (map.getSource(`geoestate-${id}`)) continue;
    map.addSource(`geoestate-${id}`, { type: "geojson", data: data?.[id] ?? { type: "FeatureCollection", features: [] } });
  }

  map.addLayer({
    id: "geoestate-roads", type: "line", source: "geoestate-roads",
    paint: {
      "line-color": ["match", ["get", "highway"], ["motorway", "motorway_link"], "#b42318", ["trunk", "trunk_link"], "#d97706", ["primary", "primary_link"], "#c58b18", ["secondary", "secondary_link"], "#d4a72c", ["tertiary", "tertiary_link"], "#4b5563", ["residential", "unclassified", "service"], "#6b7280", "#a3aaa6"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, ["match", ["get", "highway"], ["motorway", "trunk", "primary"], 1.6, 0.6], 13, ["match", ["get", "highway"], ["motorway", "trunk", "primary", "secondary"], 2.4, 1.1], 16, ["match", ["get", "highway"], ["motorway", "trunk", "primary", "secondary"], 5, 2.6]],
      "line-opacity": 0.88
    }
  });

  map.addLayer({
    id: "geoestate-properties", type: "circle", source: "geoestate-properties", minzoom: 14,
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 1.2, 17, 3.5], "circle-color": "#0b5d3b", "circle-opacity": 0.45 }
  });

  const circle = (id: string, color: any, radius: any, extra: any = {}) =>
    map.addLayer({ id: `geoestate-${id}`, type: "circle", source: `geoestate-${id}`, ...extra, paint: {
      "circle-radius": radius, "circle-color": color, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-opacity": 0.94 } });
  const zr = (a: number, b: number, c: number) => ["interpolate", ["linear"], ["zoom"], 10, a, 14, b, 17, c];

  // Education: colour by level (derived from the facility name). Campus buildings are tiny and only appear from zoom 14.
  // (MapLibre only allows "zoom" as the input of a top-level interpolate, so the per-category sizes sit inside the stops.)
  const eduSize = (a: number, b: number, c: number, camp: [number, number, number]) => ["interpolate", ["linear"], ["zoom"],
    10, ["case", ["==", ["get", "cat"], "Campus building"], 0, ["==", ["get", "cat"], "Tertiary"], a + 1, a],
    13.9, ["case", ["==", ["get", "cat"], "Campus building"], 0, ["==", ["get", "cat"], "Tertiary"], b + 1.5, b],
    14, ["case", ["==", ["get", "cat"], "Campus building"], camp[0], ["==", ["get", "cat"], "Tertiary"], b + 1.5, b],
    17, ["case", ["==", ["get", "cat"], "Campus building"], camp[2], ["==", ["get", "cat"], "Tertiary"], c + 2, c]];
  circle("schools", ["match", ["get", "cat"],
    "Nursery", "#f59e0b", "Primary", "#2563eb", "Secondary", "#7c3aed", "Tertiary", "#0f766e", "Campus building", "#94a3b8", "#64748b"],
    eduSize(3.5, 5.5, 7, [3, 3.5, 4.5]));
  // Health: colour and size by GRID3 facility level.
  circle("hospitals", ["match", ["get", "lvl"], "Tertiary", "#7f1d1d", "Secondary", "#dc2626", "Primary", "#f87171", "#9ca3af"],
    ["match", ["get", "lvl"], "Tertiary", 7, "Secondary", 5.5, 3.8]);
  circle("markets", "#c2410c", zr(3.5, 5.5, 7));
  circle("government", "#7c3aed", zr(3.5, 5.5, 7));

  map.addLayer({
    id: "geoestate-flood-fill", type: "fill", source: "geoestate-flood",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": "#168aad", "fill-opacity": 0.10 }
  });
  map.addLayer({
    id: "geoestate-flood", type: "line", source: "geoestate-flood",
    paint: { "line-color": "#168aad", "line-width": 2.5, "line-opacity": 0.72, "line-dasharray": [2, 2] }
  });

}

// Land cover is a static overlay clipped from ESA WorldCover (see scripts/prepare-worldcover.sh).
// No third-party tile server involved; if the files are not generated yet the layer is simply skipped.
async function addLandcover(map: MapLibreMap, onReady?: () => void) {
  try {
    const r = await fetch("/api/landcover/meta");
    if (!r.ok) return;
    const m = await r.json();
    if (!m.available || !m.bounds) return; // overlay files not generated yet: skip quietly
    const b = m.bounds;
    if (map.getSource("geoestate-landcover")) return;
    map.addSource("geoestate-landcover", {
      type: "image", url: m.image,
      coordinates: [[b.west, b.north], [b.east, b.north], [b.east, b.south], [b.west, b.south]],
    });
    map.addLayer({ id: "geoestate-landcover", type: "raster", source: "geoestate-landcover", paint: { "raster-opacity": 0.4, "raster-resampling": "nearest" } }, "geoestate-roads");
    onReady?.();
  } catch (e) { console.warn("GeoEstate land cover overlay unavailable", e); }
}

type Layer = { id: string; label: string; icon: React.ReactNode };

const layers: Layer[] = [
  { id: "roads", label: "Roads", icon: <Route size={15}/> },
  { id: "properties", label: "Properties", icon: <Building2 size={15}/> },
  { id: "schools", label: "Education", icon: <GraduationCap size={15}/> },
  { id: "hospitals", label: "Health facilities", icon: <Hospital size={15}/> },
  { id: "markets", label: "Markets", icon: <ShoppingBag size={15}/> },
  { id: "government", label: "Government", icon: <Landmark size={15}/> },
  { id: "flood", label: "Flood indicator", icon: <Droplets size={15}/> },
  { id: "landcover", label: "Land cover", icon: <Trees size={15}/> }
];

export default function GeoEstateApp() {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [selected, setSelected] = useState<LandCheckResult | null>(null);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lcReady, setLcReady] = useState(false);
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>(
    Object.fromEntries(layers.map(x => [x.id, true]))
  );

  const initial = useMemo(() => ({ lat: 7.7827, lng: 4.5418 }), []);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapNode.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || OSM_STYLE,
      center: [initial.lng, initial.lat],
      zoom: 12.5
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    async function loadSpatial() {
      try {
        const b = map.getBounds();
        const params = new URLSearchParams({
          south: String(b.getSouth()), west: String(b.getWest()),
          north: String(b.getNorth()), east: String(b.getEast()),
          zoom: String(map.getZoom())
        });
        const response = await fetch(`/api/spatial?${params.toString()}`);
        if (!response.ok) throw new Error("Spatial provider failed");
        const data = await response.json();
        for (const id of ["roads", "properties", "schools", "hospitals", "markets", "government", "flood"]) {
          (map.getSource(`geoestate-${id}`) as maplibregl.GeoJSONSource | undefined)?.setData(data[id]);
        }
        if (data.counts) setCounts(data.counts);
        if (data.providerStatus === "temporarily_unavailable") {
          setNotice("Live OpenStreetMap layers are temporarily unavailable. Pan the map to retry.");
        } else setNotice(null);
      } catch (error) {
        console.error("GeoEstate spatial layers failed", error);
        setNotice("Could not load map layers. Pan the map to retry.");
      }
    }

    map.on("load", () => {
      addProviderLayers(map, null); // layers exist immediately, data fills in below
      loadSpatial();
      addLandcover(map, () => setLcReady(true));
    });
    map.on("moveend", () => {
      if (!map.isStyleLoaded() || !map.getSource("geoestate-roads")) return;
      clearTimeout(loadTimer);
      loadTimer = setTimeout(loadSpatial, 600);
    });

    // Click a school / health facility dot to see its attributes (so names and types can be checked on the map).
    const esc = (v: any) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
    const poiLayers = ["geoestate-schools", "geoestate-hospitals", "geoestate-markets", "geoestate-government"];
    for (const id of poiLayers) {
      map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
    }
    map.on("click", async (e) => {
      const hit = map.getLayer("geoestate-schools") ? map.queryRenderedFeatures(e.point, { layers: poiLayers.filter(l => map.getLayer(l)) })[0] : undefined;
      if (hit) {
        const p: any = hit.properties || {};
        const isEdu = hit.layer.id === "geoestate-schools", isHealth = hit.layer.id === "geoestate-hospitals";
        const rows = isEdu ? [["Level", p.cat], ["Type", p.kind], ["Operator", p.op], ["LGA", p.lga]]
          : isHealth ? [["Level", p.lvl], ["Type", p.type]] : [];
        new maplibregl.Popup({ offset: 10, closeButton: true }).setLngLat((hit.geometry as any).coordinates)
          .setHTML(`<strong>${esc(p.name || "Unnamed")}</strong>` + rows.filter(r => r[1]).map(r => `<div style="font-size:12px;color:#475569">${r[0]}: ${esc(r[1])}</div>`).join("")).addTo(map);
        return;
      }
      try {
        const response = await fetch(`/api/landcheck?lat=${e.lngLat.lat}&lng=${e.lngLat.lng}`);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "LandCheck failed");
        setSelected(body);
        setNotice(null);
      } catch (error: any) {
        console.error("GeoEstate LandCheck failed", error);
        setNotice(error?.message || "LandCheck failed. Please try again.");
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [initial]);

  function flyToOsogbo() {
    mapRef.current?.flyTo({ center: [initial.lng, initial.lat], zoom: 12.5, duration: 900 });
    setSelected(null);
  }

  function toggleLayer(id: string) {
    const nextVisible = !activeLayers[id];
    setActiveLayers(prev => ({ ...prev, [id]: nextVisible }));
    const map = mapRef.current;
    if (!map || !VECTOR_LAYER_IDS.includes(id)) return;
    const layerIds = id === "flood" ? ["geoestate-flood", "geoestate-flood-fill"] : [`geoestate-${id}`];
    for (const layerId of layerIds) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", nextVisible ? "visible" : "none");
    }
  }

  function generateReport() {
    if (!selected) return;
    // Open the tab synchronously inside the click so popup blockers allow it.
    const w = window.open("", "_blank");
    if (!w) { setNotice("Your browser blocked the report window. Allow pop-ups for this site and try again."); return; }
    w.document.open(); w.document.write(buildReportHtml(selected)); w.document.close();
  }

  function checkCurrentLocation() {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    fetch(`/api/landcheck?lat=${c.lat}&lng=${c.lng}`)
      .then(async r => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || "LandCheck failed"); return b; })
      .then(b => { setSelected(b); setNotice(null); })
      .catch(error => { console.error("GeoEstate LandCheck failed", error); setNotice(error?.message || "LandCheck failed. Please try again."); });
  }

  return (
    <main className="geo-app">
      <header className="geo-topbar">
        <div className="brand">
          <div className="brand-mark"><MapPin size={18}/></div>
          <div className="brand-copy">
            <div className="brand-name">GEOESTATE</div>
            <div className="brand-sub">LANDCHECK • OSOGBO PILOT</div>
          </div>
        </div>

        <div className="top-search">
          <Search size={16} className="search-icon"/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={async e => {
              if (e.key !== "Enter" || !search.trim()) return;
              try {
                const response = await fetch(`/api/search?q=${encodeURIComponent(search.trim())}`);
                const data = await response.json();
                const result = data.results?.[0];
                if (result) {
                  mapRef.current?.flyTo({ center: [result.longitude, result.latitude], zoom: 15, duration: 900 });
                }
              } catch (error) { console.error("GeoEstate search failed", error); }
            }}
            placeholder="Search Osogbo, street or place..."
            aria-label="Search location"
          />
        </div>

        <div className="top-actions">
          <button className="icon-btn" title="Check current map location" onClick={checkCurrentLocation}>
            <Crosshair size={17}/>
          </button>
          <button className="icon-btn" title="Layers" onClick={() => setMenuOpen(v => !v)}>
            <Layers3 size={17}/>
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebar-title">Explore</div>
          <div className="layer-list">
            <div className="layer-row" onClick={checkCurrentLocation}>
              <div className="layer-left"><MapPin size={15} color="#0b5d3b"/>Check this location</div>
              <ChevronRight size={14} color="#9aa69f"/>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-title">Map layers</div>
            <div className="layer-list">
              {layers.map(layer => (
                <div className="layer-row" key={layer.id} onClick={() => toggleLayer(layer.id)}>
                  <div className="layer-left">
                    <span className={`layer-dot ${activeLayers[layer.id] ? "active" : ""}`}></span>
                    {layer.icon}
                    {layer.label}
                    {layer.id !== "landcover" && counts[layer.id] === 0 && <span style={{ fontSize: 10, fontWeight: 600, color: "#9a3412", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 6, padding: "1px 5px" }}>no data</span>}
                    {layer.id !== "landcover" && counts[layer.id] > 0 && <span style={{ fontSize: 10, fontWeight: 500, color: "#6b7a72" }}>{Math.round(counts[layer.id]).toLocaleString()}</span>}
                  </div>
                  <div className={`toggle ${activeLayers[layer.id] ? "on" : ""}`}><span/></div>
                </div>
              ))}
            </div>
          </div>

          <div className="landcheck-cta" style={{ marginTop: 10 }}>
            <small>Legend</small>
            {[["Nursery", "#f59e0b"], ["Primary school", "#2563eb"], ["Secondary school", "#7c3aed"], ["College / university", "#0f766e"], ["Education (level unknown)", "#64748b"], ["Campus building (zoom 14+)", "#94a3b8"],
              ["Health: tertiary", "#7f1d1d"], ["Health: secondary", "#dc2626"], ["Health: primary", "#f87171"]].map(([l, c]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: c, display: "inline-block", border: "1.5px solid #fff", boxShadow: "0 0 0 1px #cbd5e1" }} />{l}
              </div>
            ))}
          </div>
          {lcReady && activeLayers.landcover && (
            <div className="landcheck-cta" style={{ marginTop: 10 }}>
              <small>Land cover (ESA WorldCover 2021)</small>
              {[["Tree cover", "#006400"], ["Shrubland", "#ffbb22"], ["Grassland", "#ffff4c"], ["Cropland", "#f096ff"], ["Built-up", "#fa0000"],
                ["Bare / sparse vegetation", "#b4b4b4"], ["Permanent water", "#0064c8"], ["Herbaceous wetland", "#0096a0"]].map(([l, c]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 4 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: c, display: "inline-block", border: "1px solid #cbd5e1" }} />{l}
                </div>
              ))}
            </div>
          )}

          <div className="landcheck-cta">
            <small>GeoEstate intelligence</small>
            <strong>LandCheck</strong>
            <p>Drop a pin anywhere in the pilot area to explore its spatial context.</p>
            <button className="primary-btn" onClick={checkCurrentLocation}>Check location</button>
          </div>
        </aside>

        <div className="map-wrap">
          <div ref={mapNode} className="map" />

          <div className="map-overlay">
            <div className="map-chip green">OSOGBO • PILOT</div>
            <div className="map-chip">Click map to LandCheck</div>
          </div>

          {notice && (
            <div className="map-chip" role="status" style={{ position: "absolute", top: 56, left: 12, zIndex: 5, background: "#fff7ed", color: "#9a3412", border: "1px solid #fdba74" }}>
              {notice}
            </div>
          )}

          {!selected && (
            <div className="empty-hint">
              <strong>Explore Osogbo</strong>
              <span>Click anywhere on the map to run GeoEstate LandCheck.</span>
            </div>
          )}

          {selected && (
            <div className="location-card">
              <div className="card-head">
                <div>
                  <div className="card-eyebrow">GeoEstate LandCheck</div>
                  <div className="card-title">{selected.place}</div>
                  <div className="coords">{selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</div>
                </div>
                <button className="close-btn" onClick={() => setSelected(null)} aria-label="Close"><X size={15}/></button>
              </div>

              <div className="score-row">
                <div className="score">{selected.score}</div>
                <div className="score-copy">
                  <strong>Spatial context score</strong>
                  <span>Provider-backed spatial analysis from GeoEstate data services.</span>
                </div>
              </div>

              <div className="metric-grid">
                <div className="metric"><label>Accessibility</label><strong>{selected.accessibility}/100</strong></div>
                <div className="metric"><label>Infrastructure</label><strong>{selected.infrastructure}/100</strong></div>
                <div className="metric"><label>Development</label><strong>{selected.development}/100</strong></div>
                <div className="metric"><label>Environment</label><strong>{selected.environment}/100</strong></div>
              </div>

              <div className="metric-grid" style={{ marginTop: 7 }}>
                <div className="metric"><label>Nearest road</label><strong>{selected.nearestRoad}</strong></div>
                <div className="metric"><label>Nearest school</label><strong>{selected.nearestSchool}</strong></div>
                <div className="metric"><label>Elevation</label><strong>{selected.elevation}</strong></div>
                <div className="metric"><label>Land cover</label><strong>{selected.landCover}</strong></div>
                <div className="metric"><label>Schools within 2 km</label><strong>{selected.educationCount ?? "n/a"}</strong></div>
              </div>

              <div className="card-actions">
                <button className="btn-solid" onClick={generateReport}><FileText size={14} style={{ verticalAlign: "middle", marginRight: 6 }}/>Generate report</button>
                <button className="btn-outline" onClick={() => setSelected(null)}>Close</button>
              </div>
            </div>
          )}

          <div className="mobile-bottom">
            <button className="active" onClick={flyToOsogbo}><MapPin size={14} style={{verticalAlign:"middle",marginRight:4}}/>Osogbo</button>
            <button onClick={checkCurrentLocation}><Crosshair size={14} style={{verticalAlign:"middle",marginRight:4}}/>LandCheck</button>
            <button onClick={() => setMenuOpen(v => !v)}><Menu size={14} style={{verticalAlign:"middle",marginRight:4}}/>Layers</button>
          </div>
        </div>
      </section>
    </main>
  );
}
