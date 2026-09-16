import { NextRequest, NextResponse } from "next/server";

import { readMenuPhoto, type DraftItem } from "@/lib/ai/menuPhoto";
import { checkRateLimit } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST a photograph of a menu board, get dishes the customer can tick.
 *
 * ## Why this exists when an admin route already reads menus
 *
 * `readMenuPhoto` has been wired to exactly one screen — the admin importer at
 * `/api/merchants/[merchantId]/menu-photo` — because that route *publishes*:
 * the rows it saves become catalogue prices that strangers are quoted. It is
 * `ADMIN_ROLES`-gated for that reason and should stay so.
 *
 * This publishes nothing. Somebody is standing in front of a braiseur's
 * chalkboard at 1 AM, and the alternative we currently offer them is typing it.
 * The rows come back to the one person looking at the board, go into *their own*
 * order, and are never written to a merchant.
 *
 * ## What the prices are and are not
 *
 * A price read off a board fills the **goods estimate** — what we expect the
 * food to cost, which is what the spending cap is for. It is never a quote, and
 * it is never the delivery fee. Those are different numbers with different
 * owners, and the one time this product blurred them it took two versions to
 * unpick.
 *
 * On any failure: an empty list and the reason. Never an invented dish.
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

  const { data, error } = await readMenuPhoto(photoPath);

  if (!data) {
    // The reason, not an apology. "No reader is configured" and "couldn't make
    // that out" need different responses from the person holding the phone.
    return NextResponse.json({ items: [], note: error ?? "Nothing came back." });
  }

  const items: DraftItem[] = data;
  return NextResponse.json({
    items,
    note: `${items.length} item${items.length === 1 ? "" : "s"} read from the board. Prices are an estimate — the restaurant's till decides.`,
  });
}
