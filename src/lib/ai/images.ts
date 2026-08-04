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
