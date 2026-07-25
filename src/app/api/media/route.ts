import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";

/**
 * GET /api/media?path=<bucket>/<key> — dispatch-only. Returns a short-lived
 * signed URL so a dispatcher can view a private upload (payment proof, order
 * screenshot, delivery proof) without the files being publicly accessible.
 *
 * Restricted to ADMIN_ROLES: any authenticated session used to be enough, which
 * let a rider mint URLs for arbitrary private files — including prescriptions
 * the Help Centre promises stay confidential.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const full = req.nextUrl.searchParams.get("path") ?? "";
  const slash = full.indexOf("/");
  if (slash < 1) return NextResponse.json({ error: "Bad path" }, { status: 400 });
  const bucket = full.slice(0, slash);
  const key = full.slice(slash + 1);
  if (!["order-screenshots", "delivery-proofs"].includes(bucket) || !key) {
    return NextResponse.json({ error: "Bad path" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(key, 60 * 10);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
