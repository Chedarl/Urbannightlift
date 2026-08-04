import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { readDutyPoster } from "@/lib/ai/dutyPoster";
import { scoreMatch } from "@/lib/locations/normalize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A photograph of the pharmacie de garde poster, read into rows to tick.
 *
 * The roster is not on the internet. `ordrepharmacien.cm` does not resolve, and
 * the Yaoundé page of the one directory that claims to carry it is an empty
 * template. It exists as posters on pharmacy doors, PDFs and Facebook posts —
 * so the camera is not a workaround here, it is the only route.
 *
 * One photograph is worth more than any other capture in this product: it
 * yields a week of duty rows *and* a list of real pharmacies with their
 * quartiers, published weekly by the Ordre and therefore both current and
 * legally obliged to be open. That is a far better signal than any map database
 * ever gave us.
 *
 * **Writes nothing.** Each row comes back matched against the catalogue where a
 * match is confident, and unmatched otherwise, and the admin saves through the
 * existing `POST /api/pharmacy-duty` and `POST /api/merchants`.
 */

/**
 * Below this, a name is a coincidence rather than a match.
 *
 * Deliberately high. Attaching a week of duty to the wrong pharmacy is worse
 * than attaching it to none: the roster is the one thing a customer trusts at
 * 2 AM, and an unmatched row simply asks the admin which pharmacy it is.
 */
const CONFIDENT = 70;

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const photoPath = typeof body.photoPath === "string" ? body.photoPath.trim() : "";
  if (!photoPath) return NextResponse.json({ error: "No photo was given." }, { status: 400 });

  const { data: rows, error } = await readDutyPoster(photoPath);
  if (!rows) {
    return NextResponse.json({ shifts: [], note: error ?? "Nothing came back." });
  }

  const pharmacies = await prisma.merchant.findMany({
    where: { category: "PHARMACY", active: true },
    select: { id: true, merchantName: true, aliases: true },
  });

  const shifts = rows.map((row) => {
    let best: { id: string; merchantName: string } | null = null;
    let bestScore = 0;
    for (const p of pharmacies) {
      // The same matcher the customer-facing pharmacy search uses, so the
      // roster and the search can never disagree about which pharmacy is which.
      const score = scoreMatch(row.pharmacyName, p.merchantName, p.aliases);
      if (score > bestScore) {
        bestScore = score;
        best = { id: p.id, merchantName: p.merchantName };
      }
    }
    const matched = bestScore >= CONFIDENT ? best : null;
    return { ...row, merchantId: matched?.id ?? null, matchedName: matched?.merchantName ?? null };
  });

  const known = shifts.filter((s) => s.merchantId).length;

  return NextResponse.json({
    shifts,
    note:
      shifts.length === 0
        ? "Nothing readable on that poster."
        : `${shifts.length} shift${shifts.length === 1 ? "" : "s"} read — ${known} matched to a pharmacy we already have. Check the dates before saving; a wrong one sends somebody to a closed door at 2 AM.`,
  });
}
