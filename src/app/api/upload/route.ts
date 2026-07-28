import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// `order-screenshots` takes guest payment proof from the order form, and
// `merchant-logos` takes a logo from a merchant filling in their own page —
// both before anyone has signed in. `delivery-proofs` is staff-only.
const PUBLIC_BUCKETS = ["order-screenshots", "merchant-logos"];
const STAFF_BUCKETS = ["delivery-proofs"];

/**
 * POST /api/upload — returns a short-lived signed upload URL so the browser
 * uploads directly to Supabase Storage (file bytes never pass through Next.js).
 * `order-screenshots` is open to guests (order form); `delivery-proofs`
 * requires a staff session (checked via the Supabase auth cookie token).
 */
export async function POST(req: NextRequest) {
  let body: { bucket?: string; fileName?: string; orderCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bucket = body.bucket ?? "";
  if (![...PUBLIC_BUCKETS, ...STAFF_BUCKETS].includes(bucket)) {
    return NextResponse.json({ error: "Unknown bucket" }, { status: 400 });
  }

  if (STAFF_BUCKETS.includes(bucket)) {
    const { getSessionUser } = await import("@/lib/auth/session");
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const safeName = (body.fileName ?? "upload.jpg").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const prefix = (body.orderCode ?? "misc").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 20) || "misc";
  const path = `${prefix}/${Date.now()}-${safeName}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: `${bucket}/${path}` });
}
