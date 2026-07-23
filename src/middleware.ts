import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Coarse gate: /admin/** and /rider/** require an authenticated Supabase
 * session (login pages excluded). Fine-grained role/status checks happen in
 * the route-group layouts via requireRole() (Prisma is not edge-compatible).
 */
export async function middleware(request: NextRequest) {
  const { response, authUserId } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isLogin = pathname === "/admin/login" || pathname === "/rider/login";
  const isGated = pathname.startsWith("/admin") || pathname.startsWith("/rider");

  if (isGated && !isLogin && !authUserId) {
    const loginPath = pathname.startsWith("/rider") ? "/rider/login" : "/admin/login";
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/rider/:path*"],
};
