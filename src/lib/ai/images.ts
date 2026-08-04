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

/**
 * What the bytes actually are, regardless of what anything claims.
 *
 * This used to take the MIME from Supabase's blob type, falling back
 * to the file extension. Both are **metadata**, and both can disagree with the
 * bytes: a rename, a wrong `Content-Type` on upload, or a storage client
 * returning `application/octet-stream` all produce a data URI that says one
 * format over the bytes of another — which is precisely
 * *"invalid or unsupported image format"*.
 *
 * A magic number cannot be got wrong by any of those.
 */
export function sniffImageMime(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;

  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.toString("ascii", 0, 4) === "GIF8") return "image/gif";

  return null;
}

export interface ImagePayload {
  /** The data URI, or null when there is nothing safe to send. */
  dataUrl: string | null;
  /** Why not, in words a person can act on. Null when it worked. */
  problem: string | null;
  bytes: number;
  /** Sniffed from the bytes, never from a filename. */
  mime: string | null;
}

export async function readImage(path: string | null | undefined): Promise<ImagePayload> {
  const nothing = (problem: string): ImagePayload => ({ dataUrl: null, problem, bytes: 0, mime: null });

  if (!path) return nothing("No file was given.");

  const slash = path.indexOf("/");
  if (slash <= 0) return nothing("That file path is malformed.");

  const bucket = path.slice(0, slash);
  const key = path.slice(slash + 1);
  if (!key) return nothing("That file path is malformed.");
  if (!MAY_BE_READ.has(bucket)) {
    // The allow-list, unchanged and still the whole security boundary.
    // Prescriptions and rider ID are refused here as firmly as they ever were.
    return nothing("That kind of file is never shown to a model.");
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(bucket).download(key);
    if (error || !data) return nothing("Couldn't read that file back from storage.");

    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.length === 0) return nothing("That file is empty.");
    if (bytes.length > MAX_BYTES) {
      return {
        dataUrl: null,
        problem: `That file is ${Math.round(bytes.length / 1024)} KB, which is too large to send.`,
        bytes: bytes.length,
        mime: null,
      };
    }

    // Sniffed, not claimed. This is the line that stops a mislabelled upload
    // reaching the provider as "invalid or unsupported image format".
    const mime = sniffImageMime(bytes);
    if (!mime) {
      return {
        dataUrl: null,
        problem: `That file is ${Math.round(bytes.length / 1024)} KB but does not look like a PNG, JPEG, WebP or GIF.`,
        bytes: bytes.length,
        mime: null,
      };
    }

    return {
      dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
      problem: null,
      bytes: bytes.length,
      mime,
    };
  } catch {
    return nothing("Something went wrong reading that file.");
  }
}
