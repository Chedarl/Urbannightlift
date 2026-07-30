import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

const KINDS = ["GENERAL", "CALL", "VISIT", "ISSUE", "OPPORTUNITY"];

/** GET — the contact log for one merchant, newest first. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { merchantId } = await params;
  const notes = await prisma.merchantNote.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return NextResponse.json({ notes });
}

/**
 * POST — log a contact, or re-stamp "still trading".
 *
 * A note is who we spoke to and what they said. "Still trading" also refreshes
 * lastConfirmedAt so the freshness clock resets and the desk can see the
 * relationship was just confirmed by a human.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { merchantId } = await params;
  const body = await req.json().catch(() => ({}));

  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { id: true, merchantName: true } });
  if (!merchant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stillTrading = body.stillTrading === true;
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
  const kind = KINDS.includes(body.kind) ? body.kind : "GENERAL";
  if (!stillTrading && !text) return NextResponse.json({ error: "Write something first." }, { status: 400 });

  await prisma.$transaction([
    prisma.merchantNote.create({
      data: {
        merchantId,
        authorId: user.id,
        authorName: user.fullName,
        body: text || "Confirmed still trading.",
        kind: stillTrading ? "CALL" : kind,
      },
    }),
    ...(stillTrading
      ? [prisma.merchant.update({ where: { id: merchantId }, data: { lastConfirmedAt: new Date() } })]
      : []),
  ]);

  await recordAudit({
    actor: user,
    action: stillTrading ? "MERCHANT_CONFIRMED" : "MERCHANT_NOTE_ADDED",
    entityType: "merchant",
    entityId: merchantId,
    entityLabel: merchant.merchantName,
  });

  return NextResponse.json({ ok: true });
}
