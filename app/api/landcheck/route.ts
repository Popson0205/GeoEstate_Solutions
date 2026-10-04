import { NextRequest, NextResponse } from "next/server";

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });

  try {
    const elevationResponse = await fetch(`${new URL(request.url).origin}/api/elevation?lat=${lat}&lng=${lng}`, { cache: "no-store" });
    const elevationData = elevationResponse.ok ? await elevationResponse.json() : { elevation: null };

    const radius = 3000 / 111000;
    const bbox = { south: lat - radius, north: lat + radius, west: lng - radius / Math.cos(lat * Math.PI / 180), east: lng + radius / Math.cos(lat * Math.PI / 180) };
    const spatialResponse = await fetch(`${new URL(request.url).origin}/api/spatial?${new URLSearchParams(Object.entries(bbox).map(([k,v]) => [k, String(v)]))}`, { cache: "no-store" });
    const spatial = spatialResponse.ok ? await spatialResponse.json() : null;

    const nearest = (collection: any, fallback: string) => {
      const features = collection?.features || [];
      let best = Infinity;
      let bestName = fallback;
      for (const feature of features) {
        const c = feature.geometry?.type === "Point" ? feature.geometry.coordinates : feature.geometry?.type === "LineString" ? feature.geometry.coordinates[Math.floor(feature.geometry.coordinates.length / 2)] : null;
        if (!c) continue;
        const d = distanceMeters(lat, lng, c[1], c[0]);
        if (d < best) { best = d; bestName = `${feature.properties?.name || fallback} • ${Math.round(d)} m`; }
      }
      return best === Infinity ? fallback : bestName;
    };

    const road = nearest(spatial?.roads, "No nearby mapped road");
    const school = nearest(spatial?.schools, "No mapped school nearby");
    const hospital = nearest(spatial?.hospitals, "No mapped hospital nearby");
    const elevation = elevationData.elevation;
    const roadMeters = Number(road.match(/(\d+) m$/)?.[1] || 3000);
    const schoolMeters = Number(school.match(/(\d+) m$/)?.[1] || 3000);
    const accessibility = Math.max(0, Math.min(100, Math.round(100 - roadMeters / 45)));
    const infrastructure = Math.max(0, Math.min(100, Math.round(100 - (schoolMeters / 80) - ((Number(hospital.match(/(\d+) m$/)?.[1] || 3000)) / 100))));
    const development = Math.max(0, Math.min(100, Math.round(Math.min(1, (spatial?.properties?.features?.length || 0) / 250) * 100)));
    const environment = elevation == null ? 60 : 75;
    const score = Math.round(accessibility * .30 + infrastructure * .25 + development * .20 + environment * .25);

    return NextResponse.json({
      lat, lng, place: "Osogbo, Osun State", score,
      accessibility, infrastructure, development, environment,
      nearestRoad: road, nearestSchool: school, nearestHospital: hospital,
      elevation: elevation == null ? "Unavailable" : `${Math.round(elevation)} m`,
      slope: "Not yet calculated",
      landCover: "ESA WorldCover layer",
      source: "OSM/Overpass + Copernicus DEM GLO-90",
    });
  } catch (error) {
    console.error("LandCheck error", error);
    return NextResponse.json({ error: "LandCheck provider analysis failed" }, { status: 502 });
  }
}
