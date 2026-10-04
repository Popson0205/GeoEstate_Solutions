import { NextRequest, NextResponse } from "next/server";

const OVERPASS_URL = process.env.OSM_OVERPASS_URL || "https://overpass-api.de/api/interpreter";

function pointFeature(lon: number, lat: number, properties: Record<string, unknown>) {
  return { type: "Feature", properties, geometry: { type: "Point", coordinates: [lon, lat] } };
}

function wayFeature(element: any, properties: Record<string, unknown>, type: "LineString" | "Polygon") {
  const geometry = Array.isArray(element.geometry)
    ? element.geometry.map((p: any) => [p.lon, p.lat])
    : [];
  if (geometry.length < (type === "Polygon" ? 4 : 2)) return null;
  if (type === "Polygon") {
    const first = geometry[0];
    const last = geometry[geometry.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) geometry.push(first);
    return { type: "Feature", properties, geometry: { type, coordinates: [geometry] } };
  }
  return { type: "Feature", properties, geometry: { type, coordinates: geometry } };
}

function featureFromElement(element: any, kind: string) {
  const tags = element.tags || {};
  const properties = {
    osm_id: element.id,
    name: tags.name || tags["name:en"] || "Unnamed",
    kind,
    ...tags,
  };

  if (element.type === "node") return pointFeature(element.lon, element.lat, properties);
  if (element.type === "way") {
    if (kind === "properties") {
      if (Array.isArray(element.geometry)) return wayFeature(element, properties, "Polygon");
      if (element.center) return pointFeature(element.center.lon, element.center.lat, properties);
      return null;
    }
    if (kind === "roads") return wayFeature(element, properties, "LineString");
    if (kind === "flood" && tags.natural === "water") return wayFeature(element, properties, "Polygon");
    if (element.center) return pointFeature(element.center.lon, element.center.lat, properties);
    return null;
  }
  if (element.center) return pointFeature(element.center.lon, element.center.lat, properties);
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let south = Number(searchParams.get("south"));
  let west = Number(searchParams.get("west"));
  let north = Number(searchParams.get("north"));
  let east = Number(searchParams.get("east"));

  if (![south, west, north, east].every(Number.isFinite)) {
    return NextResponse.json({ error: "Invalid bounding box" }, { status: 400 });
  }

  // Keep public Overpass requests small enough for a browser map viewport.
  // The initial Osogbo viewport can otherwise ask for tens of thousands of
  // building/road geometries and trigger a provider timeout (502 on Railway).
  const centerLat = (south + north) / 2;
  const centerLng = (west + east) / 2;
  const maxLatSpan = 0.06;
  const maxLngSpan = 0.09;
  const latSpan = Math.min(north - south, maxLatSpan);
  const lngSpan = Math.min(east - west, maxLngSpan);
  south = centerLat - latSpan / 2;
  north = centerLat + latSpan / 2;
  west = centerLng - lngSpan / 2;
  east = centerLng + lngSpan / 2;

  const bbox = `${south},${west},${north},${east}`;
  const zoom = Number(searchParams.get("zoom") || 0);
  const includeBuildings = zoom >= 14;

  // Geometry is only requested for roads. Buildings and POIs use their
  // centers at this zoom level, which keeps the response small and fast.
  // A later high-zoom property endpoint can request true building polygons.
  const query = `
[out:json][timeout:15];
way["highway"~"motorway|trunk|primary|secondary|tertiary"](${bbox});
out geom qt 1500;
way["highway"~"unclassified|residential|service"](${bbox});
out center qt 1500;
(
  ${includeBuildings ? `way["building"](${bbox});` : ""}
  nwr["amenity"~"school|hospital|marketplace|townhall"](${bbox});
  nwr["shop"="market"](${bbox});
  nwr["office"="government"](${bbox});
  nwr["government"](${bbox});
  way["waterway"](${bbox});
  way["natural"="water"](${bbox});
);
out center qt ${includeBuildings ? 4000 : 800};`;

  const endpoints = Array.from(new Set([
    OVERPASS_URL,
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
  ]));

  let lastError = "Unknown Overpass error";

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "GeoEstate-LandCheck/0.3 (Osogbo pilot)",
          "Accept": "application/json"
        },
        body: new URLSearchParams({ data: query }),
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        lastError = `${endpoint} returned ${response.status}`;
        continue;
      }

      const data = await response.json();
      const elements = Array.isArray(data.elements) ? data.elements : [];
      const groups: Record<string, any[]> = {
        roads: [], properties: [], schools: [], hospitals: [], markets: [], government: [], flood: []
      };

      for (const element of elements) {
        const tags = element.tags || {};
        let kind: keyof typeof groups | null = null;
        if (tags.highway) kind = "roads";
        else if (tags.building) kind = "properties";
        else if (tags.amenity === "school") kind = "schools";
        else if (tags.amenity === "hospital") kind = "hospitals";
        else if (tags.amenity === "marketplace" || tags.shop === "market") kind = "markets";
        else if (tags.office === "government" || tags.amenity === "townhall" || tags.government) kind = "government";
        else if (tags.waterway || tags.natural === "water") kind = "flood";

        if (!kind) continue;
        const feature = featureFromElement(element, kind);
        if (feature) groups[kind].push(feature);
      }

      return NextResponse.json({
        source: "OpenStreetMap / Overpass",
        provider: endpoint,
        fetchedAt: new Date().toISOString(),
        bbox: { south, west, north, east },
        ...Object.fromEntries(
          Object.entries(groups).map(([key, features]) => [
            key,
            { type: "FeatureCollection", features }
          ])
        )
      }, {
        headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=1800" }
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Overpass request failed";
    } finally {
      clearTimeout(timeout);
    }
  }

  // Do not turn a temporary public-provider outage into a broken GeoEstate UI.
  // The map can still load; the response tells the client why the live layers
  // are temporarily empty so we can surface a non-blocking status later.
  console.error("GeoEstate spatial provider error:", lastError);
  const empty = (type: "FeatureCollection") => ({ type, features: [] });
  return NextResponse.json({
    source: "OpenStreetMap / Overpass",
    providerStatus: "temporarily_unavailable",
    warning: lastError,
    roads: empty("FeatureCollection"),
    properties: empty("FeatureCollection"),
    schools: empty("FeatureCollection"),
    hospitals: empty("FeatureCollection"),
    markets: empty("FeatureCollection"),
    government: empty("FeatureCollection"),
    flood: empty("FeatureCollection")
  }, { status: 200 });
}
