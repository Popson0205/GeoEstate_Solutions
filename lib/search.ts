import { getSnapshot } from "@/lib/osm";

// Place search over GeoEstate's own data (LGAs, schools, health facilities, markets, named roads).
// Instant and works offline; the /api/search route adds online geocoders on top for towns and streets we don't hold.
export type PlaceHit = { name: string; display: string; sub: string; kind: string; latitude: number; longitude: number; zoom: number; source: string };
type Entry = { name: string; n: string; sub: string; kind: string; lat: number; lon: number; zoom: number; bonus: number };

export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const TOWNS: [string, number, number, string][] = [
  ["Osogbo", 7.7827, 4.5418, "oshogbo"], ["Ilesa", 7.6264, 4.7447, "ilesha"], ["Ile-Ife", 7.4905, 4.5521, "ife ife city"], ["Ede", 7.7333, 4.4333, ""],
  ["Iwo", 7.6333, 4.1833, ""], ["Ikirun", 7.9167, 4.6667, ""], ["Ila Orangun", 8.0167, 4.9, "ila"], ["Ejigbo", 7.9, 4.3167, ""],
  ["Ikire", 7.3667, 4.1833, ""], ["Gbongan", 7.4667, 4.3333, ""], ["Modakeke", 7.4833, 4.5167, ""], ["Apomu", 7.2, 4.1667, ""],
  ["Ijebu-Jesa", 7.6833, 4.8167, "ijebu ijesa"], ["Ipetumodu", 7.2833, 4.4333, ""],
];

let index: Entry[] | null | undefined;

function bboxCentre(c: any): [number, number] {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (a: any) => { if (typeof a[0] === "number") { w = Math.min(w, a[0]); e = Math.max(e, a[0]); s = Math.min(s, a[1]); n = Math.max(n, a[1]); } else a.forEach(walk); };
  walk(c);
  return [(w + e) / 2, (s + n) / 2];
}

function build(): Entry[] | null {
  const s = getSnapshot(); if (!s) return null;
  const out: Entry[] = [];
  const add = (name: any, kind: string, lon: number, lat: number, sub: string, zoom: number, bonus = 0, aliases = "") => {
    const nm = String(name || "").trim(); if (!nm || nm === "Unnamed" || !Number.isFinite(lon) || !Number.isFinite(lat)) return;
    out.push({ name: nm, n: norm(nm + " " + aliases), sub, kind, lat, lon, zoom, bonus });
  };
  // Main Osun towns (approximate centres) so the big places always resolve, even offline. Aliases cover common spellings.
  for (const [nm, lat, lon, alias] of TOWNS) add(nm, "Town", lon, lat, "Osun State", 13, 20, alias);
  for (const a of s.adm1 || []) { const [x, y] = bboxCentre(a.c); add(a.name + " State", "State", x, y, "Nigeria", 9, 12, a.name); }
  for (const a of s.adm2 || []) { const [x, y] = bboxCentre(a.c); add(a.name, "LGA", x, y, "Local government area", 11, 15); }
  for (const p of s.schools || []) if (p.kind !== "campus") add(p.name, p.kind === "university" ? "University" : p.kind === "college" ? "College" : "School", p.lon, p.lat, p.lga || "", 17);
  for (const p of s.hospitals || []) add(p.name, "Health facility", p.lon, p.lat, p.lvl ? `${p.lvl} care` : "", 17);
  for (const p of s.markets || []) add(p.name, "Market", p.lon, p.lat, [p.ward, p.lga].filter(Boolean).join(", "), 16, 5);
  const seen = new Set<string>();
  for (const r of s.roads || []) {                              // named roads: one entry per name per ~5 km cell
    if (!r.n || !r.g?.length) continue;
    const m = r.g[Math.floor(r.g.length / 2)];
    const key = `${norm(r.n)}|${Math.round(m[0] / 0.05)}|${Math.round(m[1] / 0.05)}`;
    if (seen.has(key)) continue; seen.add(key);
    add(r.n, "Road", m[0], m[1], r.h ? String(r.h).replace(/_/g, " ") : "", 16);
  }
  return out;
}

export function searchLocal(q: string, limit = 10): PlaceHit[] {
  if (index === undefined) index = build();
  if (!index) return [];
  const nq = norm(q); if (nq.length < 2) return [];
  const toks = nq.split(" ");
  const scored: { e: Entry; score: number }[] = [];
  for (const e of index) {
    if (!toks.every(t => e.n.includes(t))) continue;
    const padded = " " + e.n + " ";
    let sc = e.n === nq ? 100 : (e.n.startsWith(nq + " ")) ? 85 : padded.includes(" " + nq + " ") ? 72 : e.n.startsWith(nq) ? 62
      : toks.every(t => padded.includes(" " + t)) ? 50 : 30;     // whole-word matches beat prefixes of longer words
    sc += e.bonus - Math.min(10, e.n.length / 8);
    scored.push({ e, score: sc });
  }
  scored.sort((a, b) => b.score - a.score);
  const perKind: Record<string, number> = {}; const hits: PlaceHit[] = [];
  for (const { e } of scored) {                                  // cap each type so one kind (e.g. 2,000 clinics) can't fill the list
    perKind[e.kind] = (perKind[e.kind] || 0) + 1; if (perKind[e.kind] > 4) continue;
    hits.push({ name: e.name, kind: e.kind, sub: e.sub, display: `${e.name} (${e.kind}${e.sub ? ", " + e.sub : ""})`, latitude: e.lat, longitude: e.lon, zoom: e.zoom, source: "GeoEstate data" });
    if (hits.length >= limit) break;
  }
  return hits;
}
