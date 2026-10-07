import { NextRequest, NextResponse } from "next/server";
import { googlePlaceDetails } from "@/lib/google-places";

export const dynamic = "force-dynamic";

// Resolve a chosen Google suggestion (placeId) to coordinates. Called once, when the person picks a result.
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const id = sp.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const r = await googlePlaceDetails(id, sp.get("token") || undefined);
  if (!r.ok) { console.error("Google place details failed:", r.reason, "message" in r ? r.message : ""); return NextResponse.json({ error: "Could not look up that place" }, { status: 502 }); }
  return NextResponse.json(r.data);
}
