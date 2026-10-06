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
import { iconDataUri, loadMapIcons, LAYER_GROUPS, HIT_GROUPS, buildPopupHtml, ROAD_COLORS, FLOOD_COLOR } from "@/lib/mapSymbols";

// Text labels need a glyph (font) server. Override both via env if you host your own fonts.
const GLYPHS_URL = process.env.NEXT_PUBLIC_GLYPHS_URL || "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";
const LABEL_FONT = [process.env.NEXT_PUBLIC_LABEL_FONT || "Open Sans Regular"];

const OSM_STYLE = {
  version: 8,
  glyphs: GLYPHS_URL,
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
  const hasName = ["all", ["has", "name"], ["!=", ["get", "name"], ""], ["!=", ["get", "name"], "Unnamed"]];
  const halo = { "text-halo-color": "#ffffff", "text-halo-width": 1.6, "text-halo-blur": 0.4 };

  // ---- Flood indicator (bottom): blue translucent fill + dashed outline, labelled by name when it has one
  map.addLayer({ id: "geoestate-flood-fill", type: "fill", source: "geoestate-flood", filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": FLOOD_COLOR, "fill-opacity": 0.14 } });
  map.addLayer({ id: "geoestate-flood", type: "line", source: "geoestate-flood",
    paint: { "line-color": FLOOD_COLOR, "line-width": 2.5, "line-opacity": 0.8, "line-dasharray": [2, 2] } });

  // ---- Roads: coloured by class, name painted along the line
  map.addLayer({
    id: "geoestate-roads", type: "line", source: "geoestate-roads",
    paint: {
      "line-color": ["match", ["get", "highway"], ["motorway", "motorway_link"], ROAD_COLORS.motorway, ["trunk", "trunk_link"], ROAD_COLORS.trunk, ["primary", "primary_link"], ROAD_COLORS.primary, ["secondary", "secondary_link"], ROAD_COLORS.secondary, ["tertiary", "tertiary_link"], ROAD_COLORS.tertiary, ["residential", "unclassified", "service"], ROAD_COLORS.residential, "#a3aaa6"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, ["match", ["get", "highway"], ["motorway", "trunk", "primary"], 1.6, 0.6], 13, ["match", ["get", "highway"], ["motorway", "trunk", "primary", "secondary"], 2.4, 1.1], 16, ["match", ["get", "highway"], ["motorway", "trunk", "primary", "secondary"], 5, 2.6]],
      "line-opacity": 0.88
    }
  });

  // ---- Properties: house symbol (only from zoom 15, there are thousands)
  map.addLayer({
    id: "geoestate-properties", type: "symbol", source: "geoestate-properties", minzoom: 14.5,
    layout: { "icon-image": "property", "icon-size": ["interpolate", ["linear"], ["zoom"], 14.5, 0.28, 17, 0.5], "icon-allow-overlap": true, "icon-ignore-placement": true },
  });

  map.addLayer({
    id: "geoestate-roads-label", type: "symbol", source: "geoestate-roads", minzoom: 13, filter: hasName as any,
    layout: { "symbol-placement": "line", "text-field": ["get", "name"], "text-font": LABEL_FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 13, 9, 17, 12], "text-letter-spacing": 0.03, "text-max-angle": 35 },
    paint: { "text-color": "#374151", ...halo },
  });
  map.addLayer({
    id: "geoestate-flood-label", type: "symbol", source: "geoestate-flood", minzoom: 12, filter: hasName as any,
    layout: { "symbol-placement": "line-center", "text-field": ["get", "name"], "text-font": LABEL_FONT, "text-size": 11, "text-letter-spacing": 0.08 },
    paint: { "text-color": "#0e6b86", ...halo },
  });

  // ---- Point-of-interest layers: each has its own symbol, with the name as a label
  // MapLibre only allows "zoom" as the input of a top-level interpolate, so per-category sizes sit inside the stops.
  const sized = (stops: [number, any][]) => ["interpolate", ["linear"], ["zoom"], ...stops.flatMap(([z, v]) => [z, v])];
  const poi = (id: string, icon: any, size: any, labelColor: string, labelFrom = 13) =>
    map.addLayer({
      id: `geoestate-${id}`, type: "symbol", source: `geoestate-${id}`,
      layout: {
        "icon-image": icon, "icon-size": size, "icon-allow-overlap": true, "icon-ignore-placement": true,
        "text-field": ["case", hasName as any, ["get", "name"], ""],
        "text-font": LABEL_FONT, "text-size": ["interpolate", ["linear"], ["zoom"], labelFrom - 0.01, 0, labelFrom, 11, 17, 13],
        "text-anchor": "top", "text-offset": [0, 0.9], "text-max-width": 8, "text-optional": true,
      },
      paint: { "text-color": labelColor, ...halo },
    });

  // Education: same cap glyph, colour by level. Campus buildings are tiny and only appear from zoom 14.
  const isCampus = ["==", ["get", "cat"], "Campus building"];
  const isTertiaryEdu = ["==", ["get", "cat"], "Tertiary"];
  poi("schools",
    ["match", ["get", "cat"], "Nursery", "edu-nursery", "Primary", "edu-primary", "Secondary", "edu-secondary", "Tertiary", "edu-tertiary", "Campus building", "edu-campus", "edu-unknown"],
    sized([
      [10, ["case", isCampus, 0, isTertiaryEdu, 0.5, 0.4]],
      [13.9, ["case", isCampus, 0, isTertiaryEdu, 0.7, 0.58]],
      [14, ["case", isCampus, 0.3, isTertiaryEdu, 0.7, 0.58]],
      [17, ["case", isCampus, 0.42, isTertiaryEdu, 0.95, 0.8]],
    ]),
    "#1f2937", 13.5);

  // Health: cross badge, colour and size by GRID3 facility level.
  const lvlSize = (t: number, s: number, p: number) => ["match", ["get", "lvl"], "Tertiary", t, "Secondary", s, p];
  poi("hospitals",
    ["match", ["get", "lvl"], "Tertiary", "health-tertiary", "Secondary", "health-secondary", "Primary", "health-primary", "health-unknown"],
    sized([[10, lvlSize(0.5, 0.42, 0.34)], [14, lvlSize(0.8, 0.68, 0.55)], [17, lvlSize(1.0, 0.88, 0.72)]]),
    "#7f1d1d", 13);

  poi("markets", "market", sized([[10, 0.4], [14, 0.62], [17, 0.85]]), "#9a3412", 13);
  poi("government", "gov", sized([[10, 0.4], [14, 0.62], [17, 0.85]]), "#5b21b6", 13);
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

const sym = (id: string, size = 18) => <img src={iconDataUri(id)} width={size} height={size} alt="" />;
const roadSwatch = (c: string, w: number) => <span style={{ width: 18, height: w, background: c, borderRadius: 2, display: "inline-block" }} />;
const LEGEND: { title: string; items: [string, React.ReactNode][] }[] = [
  { title: "Education", items: [["Nursery", sym("edu-nursery")], ["Primary school", sym("edu-primary")], ["Secondary school", sym("edu-secondary")], ["College / university", sym("edu-tertiary")], ["Level unknown", sym("edu-unknown")], ["Campus building (zoom 14+)", sym("edu-campus", 14)]] },
  { title: "Health facilities", items: [["Tertiary", sym("health-tertiary")], ["Secondary", sym("health-secondary")], ["Primary", sym("health-primary")]] },
  { title: "Other points", items: [["Market", sym("market")], ["Government", sym("gov")], ["Property (zoom 15+)", sym("property", 14)]] },
  { title: "Roads", items: [["Motorway / trunk", roadSwatch(ROAD_COLORS.trunk, 4)], ["Primary / secondary", roadSwatch(ROAD_COLORS.primary, 3)], ["Tertiary", roadSwatch(ROAD_COLORS.tertiary, 2)], ["Residential / service", roadSwatch(ROAD_COLORS.residential, 1.5)]] },
  { title: "Water", items: [["Flood indicator", sym("flood")]] },
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

    map.on("load", async () => {
      if (!map.getStyle().glyphs) map.setGlyphs(GLYPHS_URL); // custom styles may not define fonts; labels need them
      await loadMapIcons(map); // symbols must exist before the symbol layers are added
      addProviderLayers(map, null); // layers exist immediately, data fills in below
      loadSpatial();
      addLandcover(map, () => setLcReady(true));
    });
    map.on("moveend", () => {
      if (!map.isStyleLoaded() || !map.getSource("geoestate-roads")) return;
      clearTimeout(loadTimer);
      loadTimer = setTimeout(loadSpatial, 600);
    });

    // Click any feature (education, health, markets, government, buildings, water, roads) to see its attributes.
    // Points win over areas, areas over roads, so a click on a school sitting next to a road shows the school.
    const hitTest = (point: maplibregl.Point) => {
      for (const g of HIT_GROUPS) {
        const layersNow = g.layers.filter(l => map.getLayer(l) && map.getLayoutProperty(l, "visibility") !== "none");
        if (!layersNow.length) continue;
        const raw = map.queryRenderedFeatures([[point.x - g.pad, point.y - g.pad], [point.x + g.pad, point.y + g.pad]], { layers: layersNow });
        const seen = new Set<string>(); const hits: maplibregl.MapGeoJSONFeature[] = [];
        for (const f of raw) {
          const geom: any = f.geometry;
          const key = `${f.layer.id}|${JSON.stringify(f.properties)}|${geom.type === "Point" ? geom.coordinates.join(",") : ""}`;
          if (seen.has(key)) continue; seen.add(key); hits.push(f);
        }
        if (hits.length) return hits;
      }
      return [];
    };

    let popup: maplibregl.Popup | null = null;
    map.on("mousemove", (e) => { map.getCanvas().style.cursor = hitTest(e.point).length ? "pointer" : ""; });
    map.on("click", async (e) => {
      const hits = hitTest(e.point);
      if (hits.length) {
        popup?.remove();
        const first: any = hits[0].geometry;
        const at = first.type === "Point" ? { lng: first.coordinates[0], lat: first.coordinates[1] } : e.lngLat;
        popup = new maplibregl.Popup({ offset: 16, closeButton: true, maxWidth: "300px", className: "geo-popup" })
          .setLngLat([at.lng, at.lat])
          .setHTML(buildPopupHtml(hits.map(h => ({ layerId: h.layer.id, props: h.properties || {} })), at))
          .addTo(map);
        return;
      }
      popup?.remove();
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
    if (!map) return;
    for (const layerId of LAYER_GROUPS[id] ?? []) {
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
            {LEGEND.map(group => (
              <div key={group.title}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#4b5a52", margin: "8px 0 2px", textTransform: "uppercase", letterSpacing: ".04em" }}>{group.title}</div>
                {group.items.map(([label, swatch]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 4 }}>
                    <span style={{ width: 20, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>{swatch}</span>{label}
                  </div>
                ))}
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
                <div className="metric"><label>Slope</label><strong>{selected.slope}</strong></div>
                <div className="metric"><label>Land cover</label><strong>{selected.landCover}</strong></div>
                <div className="metric"><label>Schools within 2 km</label><strong>{selected.educationCount ?? "n/a"}</strong></div>
                <div className="metric"><label>Nearest market</label><strong>{selected.nearestMarket ?? "n/a"}</strong></div>
                <div className="metric"><label>Markets within 3 km</label><strong>{selected.marketCount ?? "n/a"}</strong></div>
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
