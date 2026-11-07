/**
 * Where LandCheck has data. Today: Osun State (its LGAs), the showcase. A state is added when it takes LandCheck up and
 * its data is prepared; outside coverage LandCheck says so and charges nothing, rather than issue a thin report.
 */
import fs from "node:fs";
import path from "node:path";

type Ring = number[][];
type Area = { name: string; polys: Ring[][]; box: [number, number, number, number] };
export const COVERED_STATES = ["Osun"];
/** Where a state asks for LandCheck: GeoEstate's inbox. */
export const REQUEST_EMAIL = process.env.LANDCHECK_REQUEST_EMAIL || "geoestate.ng@gmail.com";

let areas: Area[] | null = null;
function load(): Area[] {
  if (areas) return areas;
  try {
    const fc = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "lga_osun.json"), "utf8"));
    areas = fc.features.map((f: any) => {
      const polys: Ring[][] = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      const pts = polys.flat(2) as unknown as number[][];
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { name: String(f.properties.name), polys, box: [xs.reduce((a, b) => Math.min(a, b)), ys.reduce((a, b) => Math.min(a, b)), xs.reduce((a, b) => Math.max(a, b)), ys.reduce((a, b) => Math.max(a, b))] };
    });
  } catch (e) { console.error("LandCheck: coverage areas unavailable", e); areas = []; }
  return areas!;
}

const inRing = (x: number, y: number, r: Ring) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export type Coverage = { covered: true; state: string; lga: string } | { covered: false };

export function coverageAt(lat: number, lng: number): Coverage {
  for (const a of load()) {
    if (lng < a.box[0] || lng > a.box[2] || lat < a.box[1] || lat > a.box[3]) continue;
    if (a.polys.some(([outer, ...holes]) => inRing(lng, lat, outer) && !holes.some(h => inRing(lng, lat, h)))) return { covered: true, state: "Osun", lga: a.name };
  }
  return { covered: false };
}

/** The "bring LandCheck to your state" request: an email to GeoEstate with the place filled in. */
export function requestMailto(lat: number, lng: number, place?: string) {
  const subject = "Bring LandCheck to our state";
  const body = `Hello GeoEstate,\n\nWe would like LandCheck reports for our state.\n\nLocation we checked: ${place ? `${place} ` : ""}(${lat.toFixed(5)}, ${lng.toFixed(5)})\nOrganization:\nState / area:\nWhat we would use the reports for:\nPhone:\n`;
  return `mailto:${REQUEST_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
