import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });

  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) return NextResponse.json({ error: "Elevation provider unavailable" }, { status: 502 });
    const data = await response.json();
    return NextResponse.json({ elevation: data.elevation?.[0] ?? null, source: "Copernicus DEM GLO-90 via Open-Meteo" });
  } catch {
    return NextResponse.json({ error: "Unable to reach elevation provider" }, { status: 502 });
  }
}
