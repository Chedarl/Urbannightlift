import { NextRequest, NextResponse } from "next/server";
import { clearTileFailureMemo, tileConfig } from "@/lib/maps/tiles";
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

  const user = await getSessionUser();
  const isStaff = Boolean(user && ADMIN_ROLES.includes(user.role));

  // Staff asking again after changing something in Google Cloud get a real
  // retry rather than the remembered rejection. Staff-only, because it is the
  // one path that can force an outbound call on demand.
  if (isStaff && req.nextUrl.searchParams.get("retry") === "1") {
    clearTileFailureMemo();
  }

  const config = await tileConfig(fr);
  const { reason, ...visible } = config;

  return NextResponse.json(
    isStaff && reason ? { ...visible, reason } : visible,
    {
      headers: {
        // Ten minutes, not an hour. The server already caches the session token
        // for days, so the CDN is only saving repeat function invocations — and
        // an hour of it means somebody who has just fixed their key is told for
        // another hour that it is still broken, which is long enough to make
        // them undo the fix. Staff never get a cached answer at all, since
        // theirs carries the reason and is keyed to who they are.
        "Cache-Control": isStaff
          ? "private, no-store"
          : "public, max-age=300, s-maxage=600",
      },
    }
  );
}
