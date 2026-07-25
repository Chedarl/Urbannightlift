import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { CUSTOMER_COOKIE, verifyCustomerToken } from "@/lib/auth/customer";

const CANONICAL_HOST = "urbannighlift.com";

/**
 * 1) Canonical host: any request arriving on a *.vercel.app build URL is
 *    permanently redirected to the owner's domain, so only urbannighlift.com is
 *    ever used publicly.
 * 2) Coarse auth gate: /admin/** and /rider/** require an authenticated
 *    Supabase session (login pages excluded). Fine-grained role/status checks
 *    happen in the route-group layouts via requireRole() (Prisma is not
 *    edge-compatible).
 */
export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (host.endsWith(".vercel.app")) {
    const url = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, `https://${CANONICAL_HOST}`);
    return NextResponse.redirect(url, 308);
  }

  const { pathname } = request.nextUrl;

  // Customer accounts use their own signed cookie (not Supabase), verified here
  // with jose so the edge runtime never needs Prisma.
  if (pathname === "/account" || pathname.startsWith("/account/")) {
    const isAuthPage = pathname === "/account/login" || pathname === "/account/signup";
    if (isAuthPage) return NextResponse.next();
    const token = request.cookies.get(CUSTOMER_COOKIE)?.value;
    const customerId = token ? await verifyCustomerToken(token) : null;
    if (!customerId) {
      const url = request.nextUrl.clone();
      url.pathname = "/account/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const isGated = pathname.startsWith("/admin") || pathname.startsWith("/rider");
  if (!isGated) return NextResponse.next();

  const { response, authUserId } = await updateSession(request);
  const isLogin = pathname === "/admin/login" || pathname === "/rider/login";

  if (!isLogin && !authUserId) {
    const loginPath = pathname.startsWith("/rider") ? "/rider/login" : "/admin/login";
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on every route except Next internals and static files, so the
  // canonical-host redirect applies site-wide (auth still only gates /admin,/rider).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)"],
};
