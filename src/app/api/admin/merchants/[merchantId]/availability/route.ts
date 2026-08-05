import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { readAvailability } from "@/lib/ai/availability";
import { applyAvailability } from "@/lib/merchants/availabilityApply";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST — read a merchant's WhatsApp reply, and apply it once it has been ticked.
 *
 * Two steps on purpose, and they are not the same request:
 *
 *  - **Reading** returns what the model made of the sentence and changes
 *    nothing. Staff see which dishes it thinks went off before anything does.
 *  - **Applying** takes only the changes that came back, and writes them.
 *
 * The merchant's own path (`/api/m/[token]`) applies in one step, because there
 * the person answering *is* the business and there is nobody to check them
 * against. Staff pasting a message read on another screen is a different level
 * of confidence, and the difference is worth one tap.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const replyText = typeof body.replyText === "string" ? body.replyText : "";
  const pingId = typeof body.pingId === "string" ? body.pingId : null;

  const items = await prisma.merchantProduct.findMany({
    where: { merchantId, available: true },
    select: { id: true, name: true, nameFr: true },
    take: 60,
  });

  // `apply: true` carries the changes staff already saw and ticked, so the
  // model is not asked the same question twice and cannot answer differently
  // the second time.
  if (body.apply === true && Array.isArray(body.changes)) {
    const allowed = new Set(items.map((i) => i.id));
    const changes = (body.changes as { itemId?: unknown; name?: unknown; soldOut?: unknown }[])
      .filter((c) => typeof c.itemId === "string" && allowed.has(c.itemId))
      .map((c) => ({
        itemId: String(c.itemId),
        name: typeof c.name === "string" ? c.name : "",
        soldOut: c.soldOut === true,
      }));

    const { changed } = await applyAvailability({
      merchantId,
      pingId,
      changes,
      appliedByUserId: user.id,
      replyText,
      source: "staff_paste",
    });
    return NextResponse.json({ applied: true, changed });
  }

  const reading = await readAvailability(replyText, items);
  return NextResponse.json(reading);
}
