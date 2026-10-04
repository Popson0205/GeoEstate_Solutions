"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import {
  Search, MapPin, Layers3, Building2, GraduationCap, Hospital,
  Route, ShoppingBag, Landmark, Droplets, Trees, X, FileText,
  Crosshair, Menu, ChevronRight
} from "lucide-react";
import type { LandCheckResult } from "@/lib/demo";

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
      "line-color": ["match", ["get", "highway"], "motorway", "#b42318", "trunk", "#d97706", "primary", "#c58b18", "secondary", "#d4a72c", "tertiary", "#6b7280", "#8a938e"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.7, 13, 1.5, 16, 3.2],
      "line-opacity": 0.88
    }
  });

  map.addLayer({
    id: "geoestate-properties", type: "fill", source: "geoestate-properties",
    paint: { "fill-color": "#0b5d3b", "fill-opacity": 0.12, "fill-outline-color": "#267a59" }
  });

  const points = [
    ["schools", "#2563eb"], ["hospitals", "#dc2626"], ["markets", "#c2410c"], ["government", "#7c3aed"]
  ] as const;
  points.forEach(([id, color]) => {
    map.addLayer({ id: `geoestate-${id}`, type: "circle", source: `geoestate-${id}`, paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 14, 5.5, 17, 7],
      "circle-color": color, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-opacity": 0.94
    } });
  });

  map.addLayer({
    id: "geoestate-flood-fill", type: "fill", source: "geoestate-flood",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": "#168aad", "fill-opacity": 0.10 }
  });
  map.addLayer({
    id: "geoestate-flood", type: "line", source: "geoestate-flood",
    paint: { "line-color": "#168aad", "line-width": 2.5, "line-opacity": 0.72, "line-dasharray": [2, 2] }
  });

  // ESA WorldCover 2021 is a real 10 m land-cover product. WMS is used here
  // for visualization; analytical class extraction will be added server-side later.
  if (!map.getSource("geoestate-landcover")) {
    map.addSource("geoestate-landcover", {
      type: "raster",
      tiles: ["https://services.terrascope.be/wmts/v2?layer=WORLDCOVER_2021_MAP&style=&tilematrixset=EPSG%3A3857&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix=EPSG%3A3857%3A{z}&TileCol={x}&TileRow={y}"],
      minzoom: 5,
      maxzoom: 14,
      tileSize: 256,
      attribution: "© ESA WorldCover 2021 / Copernicus Sentinel data"
    });
    map.addLayer({ id: "geoestate-landcover", type: "raster", source: "geoestate-landcover", paint: { "raster-opacity": 0.34 } });
  }
}

type Layer = { id: string; label: string; icon: React.ReactNode };

const layers: Layer[] = [
  { id: "roads", label: "Roads", icon: <Route size={15}/> },
  { id: "properties", label: "Properties", icon: <Building2 size={15}/> },
  { id: "schools", label: "Schools", icon: <GraduationCap size={15}/> },
  { id: "hospitals", label: "Hospitals", icon: <Hospital size={15}/> },
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
    });
    map.on("moveend", () => {
      if (!map.isStyleLoaded() || !map.getSource("geoestate-roads")) return;
      clearTimeout(loadTimer);
      loadTimer = setTimeout(loadSpatial, 600);
    });

    map.on("click", async (e) => {
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
                  </div>
                  <div className={`toggle ${activeLayers[layer.id] ? "on" : ""}`}><span/></div>
                </div>
              ))}
            </div>
          </div>

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
              </div>

              <div className="card-actions">
                <button className="btn-solid"><FileText size={14} style={{ verticalAlign: "middle", marginRight: 6 }}/>Generate report</button>
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
