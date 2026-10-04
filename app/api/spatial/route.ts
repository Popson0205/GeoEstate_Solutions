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
    if (kind === "properties") return wayFeature(element, properties, "Polygon");
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
  const south = Number(searchParams.get("south"));
  const west = Number(searchParams.get("west"));
  const north = Number(searchParams.get("north"));
  const east = Number(searchParams.get("east"));

  if (![south, west, north, east].every(Number.isFinite)) {
    return NextResponse.json({ error: "Invalid bounding box" }, { status: 400 });
  }

  // Keep the first pilot request deliberately bounded. Overpass is a read-only
  // OSM data service and is not intended to be hammered with large queries.
  const query = `
[out:json][timeout:35];
(
  way["highway"](${south},${west},${north},${east});
  way["building"](${south},${west},${north},${east});
  nwr["amenity"="school"](${south},${west},${north},${east});
  nwr["amenity"="hospital"](${south},${west},${north},${east});
  nwr["amenity"="marketplace"](${south},${west},${north},${east});
  nwr["shop"="market"](${south},${west},${north},${east});
  nwr["office"="government"](${south},${west},${north},${east});
  nwr["amenity"="townhall"](${south},${west},${north},${east});
  nwr["government"](${south},${west},${north},${east});
  way["waterway"](${south},${west},${north},${east});
  way["natural"="water"](${south},${west},${north},${east});
);
out body center geom;`;

  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "GeoEstate-LandCheck/0.2 (Osogbo pilot; contact via project owner)",
      },
      body: new URLSearchParams({ data: query }),
      next: { revalidate: 900 },
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Overpass returned ${response.status}` }, { status: 502 });
    }

    const data = await response.json();
    const elements = Array.isArray(data.elements) ? data.elements : [];
    const groups: Record<string, any[]> = {
      roads: [], properties: [], schools: [], hospitals: [], markets: [], government: [], flood: [],
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
      fetchedAt: new Date().toISOString(),
      ...Object.fromEntries(Object.entries(groups).map(([key, features]) => [key, { type: "FeatureCollection", features }])),
    });
  } catch (error) {
    console.error("GeoEstate spatial provider error", error);
    return NextResponse.json({ error: "Unable to reach the OSM data provider" }, { status: 502 });
  }
}
