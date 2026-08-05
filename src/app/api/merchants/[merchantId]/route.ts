import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit, diffFields } from "@/lib/audit";
import { buildSearchKey } from "@/lib/locations/normalize";
import { detectPlatform } from "@/lib/merchants/social";
import { getOperatingSettings } from "@/lib/settings";
import { mayHardDelete, hardDeleteMerchant } from "@/lib/admin/hardDelete";

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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /*
   * Two different things behind one verb, and the difference matters.
   *
   * The default is what it has always been: deactivate. A business that has
   * closed, or turned out not to exist, stops reaching customers while its
   * orders keep pointing at a row that still explains where the food came from.
   *
   * `?hard=1` destroys it. That exists for one reason — clearing rehearsal data
   * during the trial — and is fenced accordingly: OWNER only, test mode only,
   * and the name has to be typed. It is not a stronger version of the same
   * button; it is a different action that happens to share a route.
   */
  if (new URL(req.url).searchParams.get("hard") === "1") {
    const settings = await getOperatingSettings();
    const refusal = mayHardDelete(user, settings.testMode);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const existing = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { merchantName: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Typing the name is the confirmation. A destructive action reachable by one
    // tap is a destructive action taken by accident.
    if (String(body.confirmName ?? "").trim().toLowerCase() !== existing.merchantName.trim().toLowerCase()) {
      return NextResponse.json(
        { error: `Type the business's name exactly — "${existing.merchantName}" — to delete it.` },
        { status: 400 }
      );
    }

    const result = await hardDeleteMerchant(merchantId, {
      id: user.id,
      fullName: user.fullName,
      role: user.role,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ ok: true, deleted: true, removed: result.removed });
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
