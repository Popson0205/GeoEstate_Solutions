// Map symbology for GeoEstate: one distinct symbol shape per layer, plus the attribute popup builder.
// Symbols are plain SVG strings so the same artwork is used on the map (via map.addImage) and in the sidebar legend.
import type { Map as MapLibreMap } from "maplibre-gl";

/* ------------------------------------------------------------------ colours */

export const EDU_COLORS: Record<string, string> = {
  nursery: "#f59e0b", primary: "#2563eb", secondary: "#7c3aed", tertiary: "#0f766e", campus: "#94a3b8", unknown: "#64748b",
};
export const HEALTH_COLORS: Record<string, string> = {
  tertiary: "#7f1d1d", secondary: "#dc2626", primary: "#f87171", unknown: "#9ca3af",
};
export const MARKET_COLOR = "#c2410c";
export const GOV_COLOR = "#7c3aed";
export const PROPERTY_COLOR = "#0b5d3b";
export const FLOOD_COLOR = "#168aad";

export const ROAD_COLORS: Record<string, string> = {
  motorway: "#b42318", trunk: "#d97706", primary: "#c58b18", secondary: "#d4a72c",
  tertiary: "#4b5563", residential: "#6b7280", unclassified: "#6b7280", service: "#6b7280",
};

/* ------------------------------------------------------------------ SVG symbols (24x24 viewBox, rendered at 48px) */

const svg = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">${inner}</svg>`;

// Education = round badge with a graduation cap
const eduIcon = (c: string) => svg(
  `<circle cx="12" cy="12" r="10.5" fill="${c}" stroke="#fff" stroke-width="1.5"/>` +
  `<path d="M12 6.2 4.8 10 12 13.8 19.2 10Z" fill="#fff"/>` +
  `<path d="M7.6 12.4V15.6C7.6 16.8 9.6 17.8 12 17.8S16.4 16.8 16.4 15.6V12.4L12 14.7Z" fill="#fff"/>` +
  `<path d="M19.2 10V14.2" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>`);

// Health = rounded square with a cross
const healthIcon = (c: string) => svg(
  `<rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="${c}" stroke="#fff" stroke-width="1.5"/>` +
  `<path d="M10 5.5H14V10H18.5V14H14V18.5H10V14H5.5V10H10Z" fill="#fff"/>`);

// Market = hexagon with a shopping bag
const marketIcon = (c: string) => svg(
  `<polygon points="12,1.5 21.1,6.75 21.1,17.25 12,22.5 2.9,17.25 2.9,6.75" fill="${c}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>` +
  `<path d="M7.5 9.5H16.5L17.3 17H6.7Z" fill="#fff"/>` +
  `<path d="M9.5 9.5V8.5A2.5 2.5 0 0 1 14.5 8.5V9.5" fill="none" stroke="#fff" stroke-width="1.3"/>`);

// Government = shield with a columned building
const govIcon = (c: string) => svg(
  `<path d="M12 1.8 20.8 5V11.5C20.8 16.6 17 20.2 12 22 7 20.2 3.2 16.6 3.2 11.5V5Z" fill="${c}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>` +
  `<path d="M12 6.4 17.4 9.3H6.6Z" fill="#fff"/>` +
  `<rect x="7.6" y="10.3" width="1.8" height="4.8" fill="#fff"/><rect x="11.1" y="10.3" width="1.8" height="4.8" fill="#fff"/><rect x="14.6" y="10.3" width="1.8" height="4.8" fill="#fff"/>` +
  `<rect x="6.6" y="15.9" width="10.8" height="1.4" fill="#fff"/>`);

// Property = small house silhouette (no badge, so thousands of them stay light)
const propertyIcon = (c: string) => svg(
  `<path d="M12 2.5 22 11.5H19.2V21H4.8V11.5H2Z" fill="${c}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>` +
  `<rect x="10" y="14" width="4" height="7" fill="#fff"/>`);

// Flood indicator = water drop (used in legend and popup; the map layer itself is a fill/line)
const floodIcon = (c: string) => svg(
  `<path d="M12 2.5C12 2.5 5.2 10 5.2 14.6A6.8 6.8 0 0 0 18.8 14.6C18.8 10 12 2.5 12 2.5Z" fill="${c}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>`);

export const ICONS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(EDU_COLORS).map(([k, c]) => [`edu-${k}`, eduIcon(c)])),
  ...Object.fromEntries(Object.entries(HEALTH_COLORS).map(([k, c]) => [`health-${k}`, healthIcon(c)])),
  market: marketIcon(MARKET_COLOR),
  gov: govIcon(GOV_COLOR),
  property: propertyIcon(PROPERTY_COLOR),
  flood: floodIcon(FLOOD_COLOR),
};

export const iconDataUri = (id: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ICONS[id] ?? "");

/** Register every symbol with the map. Resolves once all images are decoded and added. */
export function loadMapIcons(map: MapLibreMap): Promise<void> {
  return Promise.all(Object.keys(ICONS).map(id => new Promise<void>(resolve => {
    if (map.hasImage(id)) return resolve();
    const img = new Image(48, 48);
    img.onload = () => { if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 }); resolve(); };
    img.onerror = () => resolve(); // a missing icon should never block the map
    img.src = iconDataUri(id);
  }))).then(() => undefined);
}

/* ------------------------------------------------------------------ layer groups / interactivity */

/** Sidebar layer id -> MapLibre layer ids that belong to it (used for the visibility toggle). */
export const LAYER_GROUPS: Record<string, string[]> = {
  roads: ["geoestate-roads", "geoestate-roads-label"],
  properties: ["geoestate-properties"],
  schools: ["geoestate-schools"],
  hospitals: ["geoestate-hospitals"],
  markets: ["geoestate-markets"],
  government: ["geoestate-government"],
  flood: ["geoestate-flood", "geoestate-flood-fill", "geoestate-flood-label", "geoestate-flood-terrain"],
  landcover: ["geoestate-landcover"],
};

/** Click priority: first group with a hit wins. `pad` is the hit tolerance in screen pixels. */
export const HIT_GROUPS: { layers: string[]; pad: number }[] = [
  { layers: ["geoestate-schools", "geoestate-hospitals", "geoestate-markets", "geoestate-government"], pad: 10 },
  { layers: ["geoestate-properties"], pad: 8 },
  { layers: ["geoestate-flood-fill", "geoestate-flood"], pad: 6 },
  { layers: ["geoestate-roads"], pad: 5 },
];

/* ------------------------------------------------------------------ popup */

const esc = (v: any) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pretty = (k: string) => cap(k.replace(/[_:]+/g, " "));

const ROAD_LABELS: Record<string, string> = {
  motorway: "Motorway", trunk: "Trunk road", primary: "Primary road", secondary: "Secondary road", tertiary: "Tertiary road",
  residential: "Residential street", unclassified: "Unclassified road", service: "Service road", track: "Track",
};

export const eduIconId = (cat?: string) => {
  const k = String(cat || "").toLowerCase();
  if (k === "campus building") return "edu-campus";
  return `edu-${k in EDU_COLORS ? k : "unknown"}`;
};
export const healthIconId = (lvl?: string) => {
  const k = String(lvl || "").toLowerCase();
  return `health-${k in HEALTH_COLORS ? k : "unknown"}`;
};

type PopupSpec = { type: string; img?: string; line?: string; rows: [string, any][] };

function specFor(layerId: string, p: Record<string, any>): PopupSpec {
  const skip = new Set(["name", "kind", "osm_id"]);
  const generic = () => Object.entries(p).filter(([k, v]) => !skip.has(k) && v !== "" && v != null).slice(0, 12).map(([k, v]) => [pretty(k), v] as [string, any]);
  switch (layerId) {
    case "geoestate-schools":
      return { type: "Education", img: iconDataUri(eduIconId(p.cat)), rows: [["Level", p.cat], ["Type", p.kind && cap(String(p.kind))], ["Operator", p.op && cap(String(p.op))], ["Capacity", p.cap], ["LGA", p.lga]] };
    case "geoestate-hospitals":
      return { type: "Health facility", img: iconDataUri(healthIconId(p.lvl)), rows: [["Level", p.lvl], ["Type", p.type]] };
    case "geoestate-markets":
      return { type: "Market", img: iconDataUri("market"), rows: [["Type", p.type], ["Goods", p.goods], ["Frequency", p.freq], ["Market days", p.days], ["Settlement", p.settlement], ["Ward", p.ward], ["LGA", p.lga], ["State", p.state]] };
    case "geoestate-government":
      return { type: "Government", img: iconDataUri("gov"), rows: generic() };
    case "geoestate-properties":
      return { type: "Building", img: iconDataUri("property"), rows: generic() };
    case "geoestate-flood": case "geoestate-flood-fill":
      return { type: "Water / flood indicator", img: iconDataUri("flood"), rows: generic() };
    case "geoestate-roads": {
      const h = String(p.highway || "");
      const col = ROAD_COLORS[h] || "#a3aaa6";
      const line = `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M2 17 20 5" stroke="${col}" stroke-width="4" stroke-linecap="round" fill="none"/></svg>`;
      return { type: "Road", line, rows: [["Class", ROAD_LABELS[h] || (h && cap(h))]] };
    }
    default:
      return { type: "Feature", rows: generic() };
  }
}

export function popupName(layerId: string, p: Record<string, any>) {
  const n = String(p.name || "").trim();
  if (n && n !== "Unnamed") return n;
  return layerId === "geoestate-roads" ? "Unnamed road" : "Unnamed";
}

/** Builds the popup body for one or more features under the click (max 4 shown). */
export function buildPopupHtml(hits: { layerId: string; props: Record<string, any> }[], lngLat: { lng: number; lat: number }) {
  const shown = hits.slice(0, 4);
  const items = shown.map(h => {
    const s = specFor(h.layerId, h.props);
    const rows = s.rows.filter(r => r[1] !== "" && r[1] != null && r[1] !== undefined);
    const img = s.img ? `<img src="${s.img}" width="24" height="24" alt=""/>` : s.line || "";
    return `<div class="geo-pop-item">` +
      `<div class="geo-pop-head">${img}<div><div class="geo-pop-type">${esc(s.type)}</div><div class="geo-pop-name">${esc(popupName(h.layerId, h.props))}</div></div></div>` +
      (rows.length ? `<table class="geo-pop-table">${rows.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join("")}</table>` : "") +
      `</div>`;
  }).join("");
  const more = hits.length > shown.length ? `<div class="geo-pop-more">+${hits.length - shown.length} more here, zoom in to separate them</div>` : "";
  return `<div class="geo-pop">${items}${more}<div class="geo-pop-coords">${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}</div></div>`;
}
