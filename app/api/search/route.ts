import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) return NextResponse.json({ error: "Search provider unavailable" }, { status: 502 });
    const data = await response.json();
    const results = (data.results || []).map((item: any) => ({
      name: item.name,
      latitude: item.latitude,
      longitude: item.longitude,
      country: item.country,
      admin1: item.admin1,
      display: [item.name, item.admin1, item.country].filter(Boolean).join(", "),
    }));
    return NextResponse.json({ results, source: "Open-Meteo Geocoding" });
  } catch {
    return NextResponse.json({ error: "Unable to search locations" }, { status: 502 });
  }
}
