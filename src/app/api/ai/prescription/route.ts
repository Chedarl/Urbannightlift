import { NextRequest, NextResponse } from "next/server";

import { readPrescriptionPhoto, type DraftMedicine } from "@/lib/ai/prescriptionPhoto";
import { checkRateLimit } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST a prescription photo, get rows the customer can correct.
 *
 * ## Why this is a customer route and the menu reader is not
 *
 * `menu-photo` is admin-only because it publishes prices to strangers. This
 * publishes nothing. It hands a reading back to the one person who can check it
 * — the customer holding the paper — and the medicine list it feeds is their
 * own order, not a catalogue.
 *
 * So it is unauthenticated like the rest of the ordering path, and rate-limited
 * like the upload route it follows: a guest can legitimately need two or three
 * attempts on a bad photo at 2 AM, and a script does not.
 *
 * ## What it will not do
 *
 * It does not save an order, it does not price anything, and on any failure it
 * returns an empty list with the reason rather than a plausible-looking
 * prescription. The uploaded file reaches the pharmacist either way, which is
 * where the actual safeguard has always been.
 */
export async function POST(req: NextRequest) {
  const limit = await checkRateLimit(req, "upload");
  if (!limit.ok) {
    return NextResponse.json(
      { items: [], note: null, retryInMinutes: limit.retryInMinutes },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const photoPath = typeof body.photoPath === "string" ? body.photoPath : "";
  if (!photoPath) return NextResponse.json({ error: "No photo was given." }, { status: 400 });

  const { data, error } = await readPrescriptionPhoto(photoPath);

  if (!data) {
    /*
      The reason, not an apology, and an empty list rather than anything
      invented. "No reader is configured" and "couldn't make that out" need
      different responses from the person holding the phone, and neither of them
      is a made-up drug name.
    */
    return NextResponse.json({ items: [], note: error ?? "Nothing came back." });
  }

  const items: DraftMedicine[] = data;
  return NextResponse.json({
    items,
    note: `${items.length} medicine${items.length === 1 ? "" : "s"} read from the photo. Check every name and dose — this is a machine reading handwriting.`,
  });
}
