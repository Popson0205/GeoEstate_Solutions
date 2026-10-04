"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import {
  Search, MapPin, Layers3, Building2, GraduationCap, Hospital,
  Route, ShoppingBag, Landmark, Droplets, Trees, X, FileText,
  Crosshair, Menu, ChevronRight
} from "lucide-react";
import { demoLandCheck, type LandCheckResult } from "@/lib/demo";

const DEMO_STYLE = {
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

const DEMO_GEOJSON = {
  roads: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "Osogbo–Ilobu Road" }, geometry: { type: "LineString", coordinates: [[4.472,7.818],[4.505,7.804],[4.542,7.792],[4.581,7.778],[4.617,7.763]] } },
      { type: "Feature", properties: { name: "Fagbewesa Road" }, geometry: { type: "LineString", coordinates: [[4.500,7.760],[4.522,7.775],[4.545,7.789],[4.567,7.806]] } },
      { type: "Feature", properties: { name: "Osogbo–Iwo Road" }, geometry: { type: "LineString", coordinates: [[4.522,7.735],[4.535,7.758],[4.548,7.784],[4.558,7.818]] } }
    ]
  },
  properties: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "Demo Property A" }, geometry: { type: "Polygon", coordinates: [[[4.535,7.790],[4.539,7.790],[4.539,7.793],[4.535,7.793],[4.535,7.790]]] } },
      { type: "Feature", properties: { name: "Demo Property B" }, geometry: { type: "Polygon", coordinates: [[[4.551,7.779],[4.556,7.779],[4.556,7.783],[4.551,7.783],[4.551,7.779]]] } },
      { type: "Feature", properties: { name: "Demo Property C" }, geometry: { type: "Polygon", coordinates: [[[4.574,7.799],[4.579,7.799],[4.579,7.803],[4.574,7.803],[4.574,7.799]]] } }
    ]
  },
  schools: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "Demo School 1" }, geometry: { type: "Point", coordinates: [4.526,7.787] } },
      { type: "Feature", properties: { name: "Demo School 2" }, geometry: { type: "Point", coordinates: [4.558,7.798] } },
      { type: "Feature", properties: { name: "Demo School 3" }, geometry: { type: "Point", coordinates: [4.575,7.770] } }
    ]
  },
  hospitals: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "Demo Hospital 1" }, geometry: { type: "Point", coordinates: [4.546,7.776] } },
      { type: "Feature", properties: { name: "Demo Hospital 2" }, geometry: { type: "Point", coordinates: [4.583,7.789] } }
    ]
  },
  markets: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "Demo Market 1" }, geometry: { type: "Point", coordinates: [4.532,7.800] } },
      { type: "Feature", properties: { name: "Demo Market 2" }, geometry: { type: "Point", coordinates: [4.563,7.782] } }
    ]
  },
  government: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "Demo Government Facility 1" }, geometry: { type: "Point", coordinates: [4.551,7.795] } },
      { type: "Feature", properties: { name: "Demo Government Facility 2" }, geometry: { type: "Point", coordinates: [4.585,7.775] } }
    ]
  },
  flood: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { risk: "Potential flood-prone area" }, geometry: { type: "Polygon", coordinates: [[[4.535,7.766],[4.548,7.761],[4.565,7.765],[4.574,7.758],[4.568,7.749],[4.548,7.752],[4.531,7.759],[4.535,7.766]]] } },
      { type: "Feature", properties: { risk: "Potential flood-prone area" }, geometry: { type: "Polygon", coordinates: [[[4.580,7.806],[4.596,7.802],[4.608,7.794],[4.601,7.786],[4.586,7.790],[4.575,7.798],[4.580,7.806]]] } }
    ]
  },
  landcover: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { class: "Built-up" }, geometry: { type: "Polygon", coordinates: [[[4.518,7.816],[4.548,7.817],[4.560,7.800],[4.548,7.785],[4.520,7.789],[4.510,7.803],[4.518,7.816]]] } },
      { type: "Feature", properties: { class: "Vegetation" }, geometry: { type: "Polygon", coordinates: [[[4.568,7.817],[4.600,7.811],[4.615,7.790],[4.600,7.773],[4.572,7.781],[4.562,7.798],[4.568,7.817]]] } },
      { type: "Feature", properties: { class: "Open land" }, geometry: { type: "Polygon", coordinates: [[[4.505,7.770],[4.527,7.768],[4.536,7.748],[4.522,7.733],[4.501,7.741],[4.495,7.757],[4.505,7.770]]] } }
    ]
  }
} as const;

const VECTOR_LAYER_IDS = ["roads", "properties", "schools", "hospitals", "markets", "government", "flood", "landcover"];

function addDemoLayers(map: MapLibreMap) {
  const sources = DEMO_GEOJSON as Record<string, any>;
  Object.entries(sources).forEach(([id, data]) => {
    map.addSource(`geoestate-${id}`, { type: "geojson", data });
  });

  map.addLayer({ id: "geoestate-landcover", type: "fill", source: "geoestate-landcover", paint: { "fill-color": ["match", ["get", "class"], "Built-up", "#9fc5ad", "Vegetation", "#76a97f", "Open land", "#d9c889", "#a9b8ad"], "fill-opacity": 0.24 } });
  map.addLayer({ id: "geoestate-flood", type: "fill", source: "geoestate-flood", paint: { "fill-color": "#2e9fd0", "fill-opacity": 0.26 } });
  map.addLayer({ id: "geoestate-properties", type: "fill", source: "geoestate-properties", paint: { "fill-color": "#0b5d3b", "fill-opacity": 0.18, "fill-outline-color": "#0b5d3b" } });
  map.addLayer({ id: "geoestate-roads", type: "line", source: "geoestate-roads", paint: { "line-color": "#0b5d3b", "line-width": 4, "line-opacity": 0.78 } });

  const points = [
    ["schools", "#2563eb"], ["hospitals", "#dc2626"], ["markets", "#c2410c"], ["government", "#7c3aed"]
  ] as const;
  points.forEach(([id, color]) => {
    map.addLayer({ id: `geoestate-${id}`, type: "circle", source: `geoestate-${id}`, paint: {
      "circle-radius": 7, "circle-color": color, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2,
      "circle-opacity": 0.95
    } });
  });
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
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>(
    Object.fromEntries(layers.map(x => [x.id, true]))
  );

  const initial = useMemo(() => ({ lat: 7.7827, lng: 4.5418 }), []);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapNode.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEMO_STYLE,
      center: [initial.lng, initial.lat],
      zoom: 12.5
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

    map.on("load", () => {
      addDemoLayers(map);
    });

    map.on("click", (e) => {
      setSelected(demoLandCheck(e.lngLat.lat, e.lngLat.lng));
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
    const layer = map.getLayer(`geoestate-${id}`);
    if (layer) map.setLayoutProperty(`geoestate-${id}`, "visibility", nextVisible ? "visible" : "none");
  }

  function checkCurrentLocation() {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    setSelected(demoLandCheck(c.lat, c.lng));
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
            onKeyDown={e => { if (e.key === "Enter") flyToOsogbo(); }}
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
                  <span>Illustrative MVP scoring. Provider-backed analysis will replace demo values.</span>
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
