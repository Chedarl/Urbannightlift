"use client";

/**
 * Shrink a photo before it leaves the phone.
 *
 * Three separate problems, one fix:
 *
 *  - **The upload.** A modern phone screenshot is 1440×3120 and two to three
 *    megabytes. On Cameroonian mobile data at 1 AM that is a long wait before
 *    anything even starts happening, and this tool's entire promise is fifteen
 *    seconds a business.
 *  - **The request to the model.** Moonshot takes images as base64, which
 *    inflates by a third — so a 3 MB photo becomes a 4 MB request body, slow to
 *    send and close to the size where it gets refused.
 *  - **The bill.** Vision tokens scale with pixels. Most of a phone screenshot
 *    is empty background.
 *
 * **2000 pixels on the long edge, not smaller.** The thing being photographed
 * is often a price board with 4 500 written in marker pen, and a price misread
 * because we over-compressed is exactly the failure this product cannot afford.
 * Quality 0.9 for the same reason.
 *
 * Falls back to the original file on any failure. A photo that uploads large is
 * a slow success; a photo that does not upload is a dead end.
 */

const MAX_EDGE = 2000;
const QUALITY = 0.9;

/** Below this there is nothing to gain and something to lose. */
const SKIP_BELOW_BYTES = 300 * 1024;

export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);

    if (longest <= MAX_EDGE) {
      bitmap.close();
      return file;
    }

    const scale = MAX_EDGE / longest;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    // Browsers default to a cheap resample. Text on a menu board is exactly
    // what a cheap resample destroys.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
