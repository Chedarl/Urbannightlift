import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit, diffFields } from "@/lib/audit";
import { buildSearchKey } from "@/lib/locations/normalize";
import { detectPlatform } from "@/lib/merchants/social";

const FIELDS = [
  "merchantName",
  "category",
  "subcategory",
  "whatsappNumber",
  "phone",
  "address",
  "landmark",
  "neighbourhood",
  "latitude",
  "longitude",
  "zoneId",
  "openingHours",
  "nightOpen",
  "open24h",
  "acceptingOrders",
  "website",
  "socialUrl",
  "socialPlatform",
  "logoUrl",
  "photoUrl",
  "notes",
  "popularityRank",
  "verified",
  "active",
];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const before = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const k of FIELDS) if (k in body) data[k] = body[k];

  // Verifying is a claim that someone actually reached this merchant, so it is
  // stamped and logged. Hundreds of rows were imported from a map; a customer
  // only ever sees the ones a human stood behind.
  if (data.verified === true && !before.verified) {
    data.lastConfirmedAt = new Date();
    if (body.phoneVerified === true) data.phoneVerifiedAt = new Date();
  }

  // "Still trading" is a re-confirmation, not an edit: someone has just checked
  // that this business is open. Businesses here move and close quickly, so a
  // confirmation has to be dated rather than assumed to hold forever.
  if (body.stillTrading === true) {
    data.lastConfirmedAt = new Date();
    data.lastSeenActiveAt = new Date();
  }

  if (typeof body.socialUrl === "string") {
    const social = detectPlatform(body.socialUrl);
    data.socialUrl = social?.url ?? null;
    data.socialPlatform = social?.platform ?? null;
  }

  if (typeof data.merchantName === "string") {
    data.searchKey = buildSearchKey(data.merchantName as string, before.aliases);
  }

  const merchant = await prisma.merchant.update({ where: { id: merchantId }, data });

  await recordAudit({
    actor: { id: user.id, fullName: user.fullName, role: user.role },
    action:
      data.verified === true && !before.verified
        ? "merchant.verified"
        : body.stillTrading === true
          ? "merchant.reconfirmed"
          : "merchant.updated",
    entityType: "merchant",
    entityId: merchant.id,
    entityLabel: merchant.merchantName,
    changes: diffFields(before as unknown as Record<string, unknown>, data),
    reason: typeof body.reason === "string" ? body.reason : null,
  });

  return NextResponse.json({ merchant });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const merchant = await prisma.merchant.update({
    where: { id: merchantId },
    data: { active: false },
  });
  await recordAudit({
    actor: { id: user.id, fullName: user.fullName, role: user.role },
    action: "merchant.deactivated",
    entityType: "merchant",
    entityId: merchantId,
    entityLabel: merchant.merchantName,
  });
  return NextResponse.json({ ok: true });
}
