import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Buckets a signed-out visitor may upload into, because each is reached from a
// form that exists precisely for people who have no account yet: guest payment
// proof, a merchant filling in their own page, a guest recording an order.
//
// Open to upload is not open to read. `order-screenshots` and
// `order-voice-notes` are PRIVATE buckets, read back only through the
// ADMIN_ROLES-gated media route.
const PUBLIC_BUCKETS = ["order-screenshots", "merchant-logos", "order-voice-notes"];

// Identity documents. These used to sit in the list above, which meant anyone
// at all could mint a signed URL and push files into the bucket that holds
// riders' ID cards — no name, no number, nothing to trace. Applying now starts
// with creating an account, so the upload can require that session and every
// document arriving in storage has a person behind it.
const CUSTOMER_BUCKETS = ["rider-documents", "rider-photos"];

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
  if (![...PUBLIC_BUCKETS, ...CUSTOMER_BUCKETS, ...STAFF_BUCKETS].includes(bucket)) {
    return NextResponse.json({ error: "Unknown bucket" }, { status: 400 });
  }

  if (STAFF_BUCKETS.includes(bucket)) {
    const { getSessionUser } = await import("@/lib/auth/session");
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Identity documents need a signed-in account, or a rider already on staff
  // replacing their own ID from the rider portal.
  let ownerPrefix: string | null = null;
  if (CUSTOMER_BUCKETS.includes(bucket)) {
    const { getCustomerId } = await import("@/lib/auth/customer");
    const customerId = await getCustomerId();
    if (customerId) {
      ownerPrefix = `c-${customerId}`;
    } else {
      const { getSessionUser } = await import("@/lib/auth/session");
      const user = await getSessionUser();
      if (!user) {
        return NextResponse.json(
          { error: "Create your Urban Night Lift account before uploading documents." },
          { status: 401 }
        );
      }
      ownerPrefix = `u-${user.id}`;
    }
  }

  const safeName = (body.fileName ?? "upload.jpg").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  // Documents are filed under whoever uploaded them rather than a name the
  // browser chose, so a stored path always says who it belongs to.
  const prefix =
    ownerPrefix ?? ((body.orderCode ?? "misc").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 20) || "misc");
  const path = `${prefix}/${Date.now()}-${safeName}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: `${bucket}/${path}` });
}
