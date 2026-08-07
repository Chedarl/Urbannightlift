import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { readAvailability } from "@/lib/ai/availability";
import { applyAvailability } from "@/lib/merchants/availabilityApply";
import { recordAudit } from "@/lib/audit";

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

    /*
     * The dishes they named that we do not stock yet, ticked by a person.
     *
     * Never taken from the reading — only from what came back in this request,
     * so a row nobody looked at cannot become a product. That is the same rule
     * the changes above follow, and it is the whole reason reading and applying
     * are two requests.
     */
    const newItems = Array.isArray(body.newItems)
      ? (body.newItems as { name?: unknown; priceXaf?: unknown }[])
          .map((n) => ({
            name: typeof n.name === "string" ? n.name.trim().slice(0, 60) : "",
            priceXaf:
              Number.isFinite(Number(n.priceXaf)) && Number(n.priceXaf) > 0
                ? Math.round(Number(n.priceXaf))
                : null,
          }))
          .filter((n) => n.name.length >= 2)
          .slice(0, 20)
      : [];

    let added = 0;
    if (newItems.length > 0) {
      const existing = new Set(items.map((i) => i.name.trim().toLowerCase()));
      const fresh = newItems.filter((n) => !existing.has(n.name.toLowerCase()));
      if (fresh.length > 0) {
        const result = await prisma.merchantProduct.createMany({
          data: fresh.map((n) => ({
            merchantId,
            name: n.name,
            priceXaf: n.priceXaf,
            // Where it came from, so a price nobody typed can be traced back to
            // the WhatsApp reply it was read out of.
            source: "availability_ping",
          })),
          skipDuplicates: true,
        });
        added = result.count;
        await recordAudit({
          actor: { id: user.id, fullName: user.fullName, role: user.role },
          action: "merchant.menu_from_ping",
          entityType: "merchant",
          entityId: merchantId,
          entityLabel: fresh.map((n) => n.name).join(", ").slice(0, 200),
        });
      }
    }

    const { changed } = await applyAvailability({
      merchantId,
      pingId,
      changes,
      appliedByUserId: user.id,
      replyText,
      source: "staff_paste",
    });
    return NextResponse.json({ applied: true, changed, added });
  }

  const reading = await readAvailability(replyText, items);
  return NextResponse.json(reading);
}
