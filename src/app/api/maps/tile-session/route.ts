import { NextRequest, NextResponse } from "next/server";
import { tileConfig } from "@/lib/maps/tiles";

export const dynamic = "force-dynamic";

/**
 * GET /api/maps/tile-session — which basemap the client should draw.
 *
 * Public on purpose: the tile URL it returns is fetched by the browser anyway,
 * so there is nothing here a page's own network tab would not already show.
 * What it does hide is the session negotiation, which needs the key and a POST.
 *
 * Never fails. A Google outage returns the CARTO fallback rather than an error,
 * because every caller is a map that must draw something.
 */
export async function GET(req: NextRequest) {
  const fr = req.nextUrl.searchParams.get("lang") === "fr";
  const config = await tileConfig(fr);
  return NextResponse.json(config, {
    // The session lives for days; letting the CDN hold it for an hour keeps a
    // busy night from re-asking on every map mount.
    headers: { "Cache-Control": "public, max-age=600, s-maxage=3600" },
  });
}
