import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { buildWaLink } from "@/lib/whatsapp/links";
import { createPingToken, pingUrl, pingMessage } from "@/lib/merchants/pingLink";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST — ask a business what they actually have tonight.
 *
 * Records the ask, mints a signed link, and hands back a `wa.me` URL for the
 * browser to open. It does **not** send anything itself, and that is not a
 * shortcut: `wa.me` is click-to-chat, so a human presses send from their own
 * WhatsApp. The Meta Cloud API would send it for us and is owner-side work —
 * when it is approved, `sendWhatsApp` in `src/lib/notify/whatsapp.ts` takes over
 * here and nothing else in this flow changes.
 *
 * The row is written *before* the message goes out, so a ping that is sent and
 * never answered is visible as exactly that rather than as nothing at all.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, merchantName: true, whatsappNumber: true, products: { select: { id: true } } },
  });
  if (!merchant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (merchant.products.length === 0) {
    // Asking what is available from a business with nothing listed produces a
    // sentence nobody can act on. Say so rather than sending it.
    return NextResponse.json(
      { error: "This business has no items listed yet, so there is nothing to ask about." },
      { status: 400 }
    );
  }

  const ping = await prisma.availabilityPing.create({
    data: { merchantId: merchant.id, sentByUserId: user.id },
    select: { id: true },
  });

  const url = pingUrl(createPingToken(merchant.id, ping.id));
  return NextResponse.json({
    pingId: ping.id,
    waLink: buildWaLink(merchant.whatsappNumber, pingMessage(merchant.merchantName, url)),
    url,
  });
}
