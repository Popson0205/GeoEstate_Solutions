import { NextResponse } from "next/server";
import { landCoverBounds } from "@/lib/landcover";

export const dynamic = "force-dynamic";

export async function GET() {
  const bounds = landCoverBounds();
  if (!bounds) return NextResponse.json({ available: false }, { status: 404 });
  return NextResponse.json({ available: true, bounds, image: "/worldcover-osogbo.png", source: "ESA WorldCover 2021 v200" });
}
