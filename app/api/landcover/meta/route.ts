import { NextResponse } from "next/server";
import { landCoverBounds } from "@/lib/landcover";

export const dynamic = "force-dynamic";

export async function GET() {
  const bounds = landCoverBounds();
  if (!bounds) return NextResponse.json({ available: false, hint: "Run scripts/prepare-worldcover.sh and commit public/worldcover-osogbo.png + data/worldcover_osogbo.asc" });
  return NextResponse.json({ available: true, bounds, image: "/worldcover-osogbo.png", source: "ESA WorldCover 2021 v200" });
}
