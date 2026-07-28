import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

/**
 * Tonight's pharmacie de garde.
 *
 * Cameroon's night pharmacy duty rotates weekly and is published by the Ordre
 * des Pharmaciens as posters and PDFs, so a fixed "night pharmacies" list would
 * be wrong within days. It is kept as a date range someone enters each week
 * instead — which is honest about where the information comes from, and means a
 * stale entry expires by itself rather than quietly sending a rider to a closed
 * shutter.
 */

/** GET — public: which pharmacies are on duty right now. */
export async function GET() {
  const now = new Date();
  const shifts = await prisma.pharmacyDuty.findMany({
    where: { startsOn: { lte: now }, endsOn: { gte: now } },
    include: {
      merchant: {
        select: { id: true, merchantName: true, neighbourhood: true, address: true, phone: true, whatsappNumber: true },
      },
    },
    orderBy: { endsOn: "asc" },
  });

  return NextResponse.json({
    onDuty: shifts
      .filter((s) => s.merchant)
      .map((s) => ({
        merchantId: s.merchantId,
        merchantName: s.merchant.merchantName,
        neighbourhood: s.merchant.neighbourhood,
        address: s.merchant.address,
        phone: s.merchant.phone?.trim() || s.merchant.whatsappNumber?.trim() || null,
        until: s.endsOn.toISOString(),
      })),
  });
}

/** POST — staff: put a pharmacy on duty for a date range. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const merchantId = typeof body.merchantId === "string" ? body.merchantId : "";
  const startsOn = body.startsOn ? new Date(body.startsOn) : null;
  const endsOn = body.endsOn ? new Date(body.endsOn) : null;

  if (!merchantId || !startsOn || !endsOn || Number.isNaN(startsOn.getTime()) || Number.isNaN(endsOn.getTime())) {
    return NextResponse.json({ error: "A pharmacy and both dates are required" }, { status: 400 });
  }
  if (endsOn <= startsOn) {
    return NextResponse.json({ error: "The duty must end after it starts" }, { status: 400 });
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { category: true, merchantName: true },
  });
  if (merchant?.category !== "PHARMACY") {
    return NextResponse.json({ error: "Only a pharmacy can be on duty" }, { status: 400 });
  }

  const duty = await prisma.pharmacyDuty.create({
    data: { merchantId, startsOn, endsOn, notes: typeof body.notes === "string" ? body.notes : null },
  });

  await recordAudit({
    actor: { id: user.id, fullName: user.fullName, role: user.role },
    action: "pharmacy.duty_set",
    entityType: "merchant",
    entityId: merchantId,
    entityLabel: merchant.merchantName,
    changes: { duty: { from: null, to: `${startsOn.toDateString()} → ${endsOn.toDateString()}` } },
  });

  return NextResponse.json({ duty }, { status: 201 });
}

/** DELETE — staff: take a pharmacy off duty (?dutyId=). */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dutyId = req.nextUrl.searchParams.get("dutyId") ?? "";
  await prisma.pharmacyDuty.deleteMany({ where: { id: dutyId } });
  return NextResponse.json({ ok: true });
}
