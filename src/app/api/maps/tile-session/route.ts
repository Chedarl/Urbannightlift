import { NextRequest, NextResponse } from "next/server";
import { tileConfig } from "@/lib/maps/tiles";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/maps/tile-session — which basemap the client should draw.
 *
 * Public on purpose: the tile URL it returns is fetched by the browser anyway,
 * so there is nothing here a page's own network tab would not already show.
 * What it hides is the session negotiation, which needs the server key and a
 * POST.
 *
 * `reason` — why we fell back, in Google's own words — is returned **only to
 * signed-in staff**. It can quote an API key or a project detail back, and a
 * customer has no use for it. Everyone else gets a working map and no
 * explanation, which is the right split.
 *
 * Never fails. A Google outage returns the CARTO fallback rather than an error,
 * because every caller is a map that must draw something.
 */
export async function GET(req: NextRequest) {
  const fr = req.nextUrl.searchParams.get("lang") === "fr";
  const config = await tileConfig(fr);

  const user = await getSessionUser();
  const isStaff = Boolean(user && ADMIN_ROLES.includes(user.role));
  const { reason, ...visible } = config;

  return NextResponse.json(
    isStaff && reason ? { ...visible, reason } : visible,
    {
      headers: {
        // The session lives for days, so letting the CDN hold it briefly keeps a
        // busy night from re-asking on every map mount. Private and short when a
        // staff member is asking, since that response carries the reason and is
        // keyed to who they are.
        "Cache-Control": isStaff
          ? "private, no-store"
          : "public, max-age=600, s-maxage=3600",
      },
    }
  );
}
