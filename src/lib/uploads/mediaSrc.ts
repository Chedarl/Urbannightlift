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

/**
 * Whether a stored image column is naming **our own storage** and nothing else.
 *
 * Written after the audit found the hole this closes. `PATCH
 * /api/merchant-account/shop` accepted `logoUrl` and `photoUrl` as any string
 * up to 500 characters, and `mediaSrc` hands an absolute URL straight to an
 * `<img src>` on the **public** food page. So a signed-in merchant could point
 * their cover photo at `https://evil.example/beacon.gif` and collect the IP and
 * user-agent of every customer who browsed the page — a tracking beacon on our
 * own storefront, planted through a form we built for them.
 *
 * Partly my own doing: before `mediaSrc`, the card wrapped these values in
 * `/api/media`, which was broken but at least sent nothing off-site.
 *
 * A stored image may therefore be exactly two things:
 *
 *  - a `bucket/key` path in our own storage, or
 *  - an absolute URL on the configured Supabase host.
 *
 * Anything else — any other host, a `data:` URI, a protocol-relative URL, a
 * `javascript:` scheme — is refused at the API and rendered as no image.
 *
 * Deliberately an allow-list of one host rather than a block-list of bad ones.
 * There is no legitimate reason for a merchant's photograph to live anywhere
 * but the bucket we gave them to upload it to.
 */
export function isOwnStorage(value: string | null | undefined): boolean {
  const raw = value?.trim();
  if (!raw) return false;

  if (/^https?:\/\//i.test(raw)) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) return false;
    try {
      return new URL(raw).host === new URL(base).host;
    } catch {
      return false;
    }
  }

  // A bare `bucket/key`. No scheme, no host, no traversal, and a bucket we
  // recognise — an unknown bucket is refused rather than stored and puzzled
  // over later.
  if (raw.includes("://") || raw.startsWith("//") || raw.includes("..")) return false;
  const slash = raw.indexOf("/");
  if (slash < 1 || slash === raw.length - 1) return false;
  return KNOWN_BUCKETS.includes(raw.slice(0, slash));
}

/** Every bucket this product uploads into. Anything else is not ours. */
const KNOWN_BUCKETS = [
  "merchant-logos",
  "rider-photos",
  "order-screenshots",
  "delivery-proofs",
  "rider-documents",
  "order-voice-notes",
  "goods-receipts",
  "merchant-menus",
  "merchant-captures",
];

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
