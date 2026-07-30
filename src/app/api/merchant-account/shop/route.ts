import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentMerchant } from "@/lib/auth/merchant";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * What a merchant may change about themselves.
 *
 * The allow-list is the whole design. A merchant can say the kitchen is closed,
 * fix their own hours and contact details, and update their products — the
 * things they know better than we do and should never have to phone us about.
 *
 * They cannot touch `verified`, `floatLimitXaf`, `floatSuspended` or `active`.
 * Those are our judgements about them: whether the business is real, how much
 * credit we extend, whether they trade with us at all. A merchant marking
 * themselves verified would put an unchecked shop in front of customers, and one
 * raising their own float limit would be lending themselves our money.
 */

const MAX = { name: 120, address: 300, hours: 120, url: 500 };

export async function PATCH(req: NextRequest) {
  const merchant = await getCurrentMerchant();
  if (!merchant) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  // The one a merchant reaches for most: the kitchen is closed, stop sending
  // people. It has to be one tap and take effect immediately.
  if (typeof body.acceptingOrders === "boolean") data.acceptingOrders = body.acceptingOrders;
  if (typeof body.nightOpen === "boolean") data.nightOpen = body.nightOpen;
  if (typeof body.open24h === "boolean") data.open24h = body.open24h;

  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) || null : undefined;

  const openingHours = str(body.openingHours, MAX.hours);
  if (openingHours !== undefined) data.openingHours = openingHours;
  const address = str(body.address, MAX.address);
  if (address !== undefined && address) data.address = address;
  const landmark = str(body.landmark, MAX.address);
  if (landmark !== undefined) data.landmark = landmark;
  const phone = str(body.phone, 20);
  if (phone !== undefined) data.phone = phone;
  const website = str(body.website, MAX.url);
  if (website !== undefined) data.website = website;
  const socialUrl = str(body.socialUrl, MAX.url);
  if (socialUrl !== undefined) data.socialUrl = socialUrl;
  const logoUrl = str(body.logoUrl, MAX.url);
  if (logoUrl !== undefined) data.logoUrl = logoUrl;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  // Touching this doubles as "this business is alive", which is exactly the
  // signal the freshness ranking wants and the hardest one to collect by hand.
  data.lastConfirmedAt = new Date();
  data.lastSeenActiveAt = new Date();

  await prisma.merchant.update({ where: { id: merchant.id }, data });

  await recordAudit({
    entityType: "merchant",
    entityId: merchant.id,
    entityLabel: merchant.merchantName,
    action: "MERCHANT_SELF_UPDATE",
    // No staff actor: the business changed its own record, and the trail should
    // say so rather than leave it looking like one of us did it.
    actor: null,
    reason: Object.keys(data).filter((k) => !k.startsWith("last")).join(", "),
  });

  return NextResponse.json({ ok: true });
}
