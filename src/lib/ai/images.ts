import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A short-lived link to a private image, for the one caller allowed to have it.
 *
 * Receipts and payment screenshots live in private buckets and are reachable
 * only through the staff-gated media route, which redirects a browser. A model
 * is not a browser and cannot follow a redirect behind a session cookie, so it
 * needs the signed URL itself.
 *
 * Five minutes. Long enough for one call including a retry, short enough that a
 * URL captured from a log is worthless by the time anybody reads it. This is
 * deliberately shorter than the ten minutes the media route hands a human, who
 * may reasonably leave a tab open.
 *
 * **What may pass through here is a deliberately short list.** Not prescriptions
 * — the privacy page promises those are seen only by the staff handling that
 * order, and that promise stays true. Not rider ID documents, for the same
 * reason and more so. The allow-list is enforced here rather than left to each
 * caller, because "we forgot which bucket this was" is exactly how a promise
 * like that gets broken.
 */

const MAY_BE_READ = new Set([
  "goods-receipts",
  "order-screenshots",
  "merchant-menus",
  // Screenshots of a business's own page and photographs of the pharmacie de
  // garde poster. Staff-uploaded, never a customer document.
  "merchant-captures",
]);

const TTL_SECONDS = 5 * 60;

/**
 * Turns a stored `bucket/key` path into a signed URL, or null.
 *
 * Null for a bucket that is not allowed, a malformed path, or a storage error —
 * and every caller treats null as "we could not read it", which is never an
 * error state in this product.
 */
export async function signedImageUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;

  const slash = path.indexOf("/");
  if (slash <= 0) return null;

  const bucket = path.slice(0, slash);
  const key = path.slice(slash + 1);
  if (!key || !MAY_BE_READ.has(bucket)) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(key, TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * The largest image we will put in a request body.
 *
 * Base64 inflates by about a third, so 6 MB of file becomes ~8 MB on the wire.
 * Anything above this is a photo that should have been downscaled in the browser
 * before it was uploaded, and sending it would buy a slow request and a probable
 * rejection rather than an answer.
 */
const MAX_BYTES = 6 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * The image itself, as a data URI — which is the only form Moonshot accepts.
 *
 * **This is the bug that made every vision feature in this product a no-op.**
 * Receipts, payment proofs, menu boards, business screenshots and the pharmacy
 * duty poster all handed Kimi a signed Supabase HTTPS URL, and Moonshot's own
 * documentation is explicit that *public image URLs are not supported — use
 * base64 or an `ms://` file id*. Five features, shipped across three rounds,
 * none of which could ever have returned anything.
 *
 * It survived because the only call ever proved end to end was `admin.test`,
 * which sends no image at all. A check that does not exercise the thing it
 * vouches for is worse than no check: it goes green and buys false confidence.
 * There is now a *Test vision* button beside it for exactly that reason.
 *
 * The allow-list above still does all the work it did before — this function is
 * the single gate, and a prescription or a rider's ID is refused here as firmly
 * as it ever was. What changed is only how the bytes travel.
 */
export async function imageDataUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;

  const slash = path.indexOf("/");
  if (slash <= 0) return null;

  const bucket = path.slice(0, slash);
  const key = path.slice(slash + 1);
  if (!key || !MAY_BE_READ.has(bucket)) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(bucket).download(key);
    if (error || !data) return null;

    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;

    // The blob's own type where storage kept one, the extension otherwise.
    // Getting this wrong is not cosmetic — the provider reads the MIME from the
    // data URI and refuses a body that disagrees with its bytes.
    const extension = key.split(".").pop()?.toLowerCase() ?? "";
    const mime =
      data.type && data.type.startsWith("image/")
        ? data.type
        : MIME_BY_EXTENSION[extension] ?? "image/jpeg";

    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
