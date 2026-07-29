import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Buckets a signed-out visitor may upload into, because each is reached from a
// form that exists precisely for people who have no account yet:
// `order-screenshots` (guest payment proof), `merchant-logos` (a merchant
// filling in their own page), `rider-documents` and `rider-photos` (somebody
// applying to ride for us), `order-voice-notes` (a guest recording an order).
//
// Open to upload is not open to read. `rider-documents` and `order-voice-notes`
// are PRIVATE buckets — an ID card and a recording of someone's voice and
// address are only ever read back through the ADMIN_ROLES-gated media route.
// Only `merchant-logos` and `rider-photos` are publicly readable, and both hold
// something meant to be seen by customers.
const PUBLIC_BUCKETS = [
  "order-screenshots",
  "merchant-logos",
  "rider-documents",
  "rider-photos",
  "order-voice-notes",
];
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
