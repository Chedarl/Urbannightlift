import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, limitMessage } from "@/lib/security/rateLimit";

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

// `goods-receipts` holds the shop receipt a rider photographs when buying on a
// customer's behalf. Private: it is the customer's proof that we charged what
// we were charged, not something to hand around in a shareable link.
const STAFF_BUCKETS = ["delivery-proofs", "goods-receipts", "merchant-menus", "merchant-captures"];

/**
 * What each bucket accepts, mirroring `ensureStorageBuckets` in `prisma/seed.ts`.
 *
 * The bucket is the enforcement point — Supabase refuses a mismatched upload
 * whatever this file says. This copy exists so a caller gets a sentence it can
 * act on at mint time rather than an opaque storage failure after the upload,
 * and it is deliberately the same list rather than a looser one.
 */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_TYPES: Record<string, string[]> = {
  "order-screenshots": IMAGE_TYPES,
  "merchant-logos": IMAGE_TYPES,
  "delivery-proofs": IMAGE_TYPES,
  "goods-receipts": IMAGE_TYPES,
  "merchant-menus": IMAGE_TYPES,
  "merchant-captures": IMAGE_TYPES,
  "rider-photos": IMAGE_TYPES,
  "rider-documents": [...IMAGE_TYPES, "application/pdf"],
  // What phone browsers actually produce: Chrome/Android gives webm, Safari
  // gives mp4 or m4a.
  "order-voice-notes": [
    "audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-m4a", "audio/aac",
  ],
};

/**
 * POST /api/upload — returns a short-lived signed upload URL so the browser
 * uploads directly to Supabase Storage (file bytes never pass through Next.js).
 * `order-screenshots` is open to guests (order form); `delivery-proofs`
 * requires a staff session (checked via the Supabase auth cookie token).
 */
export async function POST(req: NextRequest) {
  let body: { bucket?: string; fileName?: string; orderCode?: string; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bucket = body.bucket ?? "";
  if (![...PUBLIC_BUCKETS, ...CUSTOMER_BUCKETS, ...STAFF_BUCKETS].includes(bucket)) {
    return NextResponse.json({ error: "Unknown bucket" }, { status: 400 });
  }

  /*
   * A limit on minting upload URLs, which had none at all.
   *
   * The three public buckets need no session — guest checkout uploads a payment
   * screenshot, `/merchant/join` uploads a logo, a guest records a voice note —
   * so "require an account" would break three deliberate flows. Without a
   * limit, though, this endpoint hands out signed URLs forever, and
   * `merchant-logos` is public-read: that is free image hosting on our
   * infrastructure and an unbounded storage bill.
   *
   * Applied to everyone rather than only to guests. A stolen staff session
   * should not be able to do this either, and 30 an hour is far above what any
   * real screen here asks for.
   */
  const limit = await checkRateLimit(req, "upload");
  if (!limit.ok) {
    return NextResponse.json(
      { error: limitMessage(limit, false), retryInMinutes: limit.retryInMinutes },
      { status: 429, headers: { "Retry-After": String(limit.retryInMinutes * 60) } }
    );
  }

  /*
   * Bind the declared type, so the bucket's own rule actually applies.
   *
   * The bytes never pass through here — the browser PUTs them straight to
   * Supabase with a signed URL, which is what keeps a 10 MB scan off a
   * serverless function. So this route cannot sniff them, and any check it did
   * make would be advisory.
   *
   * The enforcement that does bind is the bucket's `allowedMimeTypes` and
   * `fileSizeLimit`, set in `ensureStorageBuckets`. This check is the early,
   * legible half: a caller naming a type the bucket would refuse is told so
   * here, in a sentence, instead of receiving a signed URL and a cryptic
   * storage error thirty seconds later.
   */
  const declared = typeof body.contentType === "string" ? body.contentType.split(";")[0].trim() : "";
  const allowed = ALLOWED_TYPES[bucket] ?? [];
  if (declared && allowed.length > 0 && !allowed.includes(declared)) {
    return NextResponse.json(
      { error: `${bucket} only accepts ${allowed.join(", ")}.` },
      { status: 400 }
    );
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
