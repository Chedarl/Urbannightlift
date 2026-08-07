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

  /*
   * A merchant with nothing listed used to be refused here, on the reasoning
   * that asking "what ran out" of an empty list produces a sentence nobody can
   * act on. True — and it made the feature unreachable, because the way a list
   * gets filled is by asking. A business sat verified and empty forever.
   *
   * So the ask changes instead of being blocked: with no list we ask what they
   * sell and for how much, and their answer becomes the menu.
   */
  const empty = merchant.products.length === 0;

  const ping = await prisma.availabilityPing.create({
    data: { merchantId: merchant.id, sentByUserId: user.id },
    select: { id: true },
  });

  const url = pingUrl(createPingToken(merchant.id, ping.id));
  return NextResponse.json({
    pingId: ping.id,
    waLink: buildWaLink(merchant.whatsappNumber, pingMessage(merchant.merchantName, url, empty)),
    // So the panel knows which reply it is about to read.
    askedForMenu: empty,
    url,
  });
}
