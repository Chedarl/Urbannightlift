/**
 * Where an uploaded image is actually fetched from.
 *
 * This product has two kinds of storage, read in opposite ways, and a stored
 * column can hold either of three shapes. Getting that wrong is why a logo the
 * owner uploaded perfectly showed as a broken frame on the order page.
 *
 * ## What went wrong, precisely
 *
 * `/api/upload` hands back `path` as **`bucket/key`** — not a URL — and
 * `MerchantSignupForm` stores exactly that in `Merchant.logoUrl`. Two components
 * then guessed differently about what was in the column:
 *
 *  - `MerchantsManager` rendered `src={logoUrl}` raw, which only works if the
 *    value is a complete URL.
 *  - `RestaurantCard` wrapped it in `/api/media?path=…`, which is the route for
 *    **private** files — and that route refuses `merchant-logos` with 400 *and*
 *    requires an `ADMIN_ROLES` session, so on a customer's phone it could never
 *    have loaded.
 *
 * At most one of those could ever be right, and for a merchant who signed
 * themselves up neither was. It looked like a failed upload; it was two
 * components disagreeing about a string.
 *
 * ## The rule
 *
 * Decide from the **bucket**, never from how the value happens to look:
 *
 *  - **Already finished** — `https://…`, a `data:` URI, a root-relative path.
 *    Nothing of ours to sign; hand it back untouched.
 *  - **Public-read buckets** — `merchant-logos`, `rider-photos`. A shop's logo
 *    and a rider's face are meant to be seen by customers, and a signed URL
 *    would expire in the middle of a delivery. Served straight from Supabase.
 *  - **Everything else** — prescriptions, payment proofs, identity cards, voice
 *    notes, goods receipts. Private, staff-only, through the gated `/api/media`.
 *
 * `PUBLIC_READ` is the exact complement of `PRIVATE_BUCKETS` in
 * `src/app/api/media/route.ts`. If a bucket is ever added there, it is private
 * here by default — the safe direction to be wrong in, and the reason this is a
 * deny-list rather than an allow-list.
 */

/**
 * Buckets whose contents are meant to be looked at by anyone.
 *
 * Deliberately short and deliberately hard to grow: adding a bucket here makes
 * its contents world-readable by URL forever, which is the wrong answer for
 * every other bucket this product has.
 */
const PUBLIC_READ = ["merchant-logos", "rider-photos"];

export function mediaSrc(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  // Already a complete reference. A public bucket that stored the whole URL, an
  // inline data URI, or something served from our own origin.
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("/")) {
    return raw;
  }

  const slash = raw.indexOf("/");
  if (slash < 1 || slash === raw.length - 1) return null;
  const bucket = raw.slice(0, slash);

  if (PUBLIC_READ.includes(bucket)) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    // No base configured means no image rather than a request to `/storage/...`
    // on our own origin, which would 404 and read as a broken upload.
    return base ? `${base}/storage/v1/object/public/${raw}` : null;
  }

  // Private: staff only, signed for ten minutes, and refused outright for any
  // bucket the media route does not recognise.
  return `/api/media?path=${encodeURIComponent(raw)}`;
}
