import { NextRequest, NextResponse } from "next/server";

/** Changes through the API must come from LandCheck's own pages (they send X-GeoEstate: 1), not from another site. */
export function middleware(req: NextRequest) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.get("x-geoestate") !== "1")
    return NextResponse.json({ error: "Missing the X-GeoEstate header.", code: "csrf" }, { status: 403 });
  return NextResponse.next();
}
export const config = { matcher: "/api/:path*" };
