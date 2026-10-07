// Google Places API (New) - server-side only. The key never reaches the browser.
//   Autocomplete:   POST https://places.googleapis.com/v1/places:autocomplete
//   Place Details:  GET  https://places.googleapis.com/v1/places/{id}   (returns coordinates for a chosen suggestion)
// Env: GOOGLE_MAPS_API_KEY   (enable "Places API (New)" in Google Cloud). Optional: GOOGLE_PLACES_DISABLED=1 to switch it off.
export type GoogleHit = { name: string; kind: string; sub: string; display: string; placeId: string; source: "Google"; latitude?: number; longitude?: number; zoom?: number };
export type GoogleResult<T> = { ok: true; data: T } | { ok: false; reason: "no_key" | "disabled" | "error"; message?: string };

const BASE = "https://places.googleapis.com/v1";
// Bias (not restrict) suggestions toward Osun State; results are limited to Nigeria.
const OSUN_BIAS = { rectangle: { low: { latitude: 6.98, longitude: 4.05 }, high: { latitude: 8.10, longitude: 5.06 } } };

export const googleKey = () => (process.env.GOOGLE_PLACES_DISABLED === "1" ? "" : process.env.GOOGLE_MAPS_API_KEY || "");

async function call(url: string, init: RequestInit, ms = 5000): Promise<{ status: number; json: any }> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal, cache: "no-store" });
    return { status: r.status, json: await r.json().catch(() => null) };
  } finally { clearTimeout(t); }
}

// Small in-memory cache so repeated identical queries don't cost another API request (10 min, max 500 entries).
const cache = new Map<string, { at: number; hits: GoogleHit[] }>();
const TTL = 10 * 60 * 1000;

const KIND: [RegExp, string][] = [
  [/hospital|doctor|health|pharmacy/, "Health"], [/school|university|college/, "Education"], [/market|supermarket|store|shopping/, "Shop / market"],
  [/locality|sublocality|neighborhood|political|administrative/, "Area"], [/route|street_address/, "Road / address"], [/bank|atm|finance/, "Bank"],
  [/lodging|hotel/, "Hotel"], [/restaurant|food|cafe/, "Food"], [/church|mosque|place_of_worship/, "Worship"], [/park|tourist|natural|point_of_interest|establishment/, "Place"],
];
const kindOf = (types: string[] = []) => { const s = types.join(" "); return KIND.find(([re]) => re.test(s))?.[1] ?? "Place"; };

export async function googleAutocomplete(q: string, sessionToken?: string, limit = 5): Promise<GoogleResult<GoogleHit[]>> {
  const key = googleKey();
  if (!key) return { ok: false, reason: process.env.GOOGLE_PLACES_DISABLED === "1" ? "disabled" : "no_key" };
  const ck = q.toLowerCase();
  const hit = cache.get(ck); if (hit && Date.now() - hit.at < TTL) return { ok: true, data: hit.hits.slice(0, limit) };
  try {
    const { status, json } = await call(`${BASE}/places:autocomplete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({ input: q, languageCode: "en", includedRegionCodes: ["ng"], locationBias: OSUN_BIAS, ...(sessionToken ? { sessionToken } : {}) }),
    });
    if (status !== 200) return { ok: false, reason: "error", message: `${status} ${json?.error?.status || ""} ${json?.error?.message || ""}`.trim() };
    const hits: GoogleHit[] = [];
    for (const s of json?.suggestions || []) {
      const p = s.placePrediction; if (!p?.placeId) continue;            // skip query predictions
      const main = p.structuredFormat?.mainText?.text || p.text?.text || "";
      const sub = p.structuredFormat?.secondaryText?.text || "";
      hits.push({ name: main, kind: kindOf(p.types), sub, display: p.text?.text || main, placeId: p.placeId, source: "Google" });
    }
    if (cache.size > 500) cache.clear();
    cache.set(ck, { at: Date.now(), hits });
    return { ok: true, data: hits.slice(0, limit) };
  } catch (e) { return { ok: false, reason: "error", message: (e as Error).message }; }
}

export async function googlePlaceDetails(placeId: string, sessionToken?: string): Promise<GoogleResult<{ name: string; latitude: number; longitude: number; zoom: number; address: string }>> {
  const key = googleKey(); if (!key) return { ok: false, reason: "no_key" };
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return { ok: false, reason: "error", message: "bad place id" };
  try {
    const url = `${BASE}/places/${encodeURIComponent(placeId)}${sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ""}`;
    const { status, json } = await call(url, { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "displayName,formattedAddress,location,viewport" } });
    if (status !== 200 || !json?.location) return { ok: false, reason: "error", message: `${status} ${json?.error?.message || "no location"}` };
    const v = json.viewport; const span = v ? Math.max(Math.abs(v.high.latitude - v.low.latitude), Math.abs(v.high.longitude - v.low.longitude)) : 0;
    const zoom = span > 0.5 ? 10 : span > 0.1 ? 12 : span > 0.03 ? 14 : span > 0.008 ? 15 : 17;
    return { ok: true, data: { name: json.displayName?.text || "", latitude: json.location.latitude, longitude: json.location.longitude, zoom, address: json.formattedAddress || "" } };
  } catch (e) { return { ok: false, reason: "error", message: (e as Error).message }; }
}
