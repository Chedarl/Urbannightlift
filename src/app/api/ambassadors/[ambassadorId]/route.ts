import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { ambassadorBalance } from "@/lib/ambassadors/accrual";

/**
 * PATCH /api/ambassadors/[id] — approve, suspend, or record a payout.
 *
 * Paying someone is the part that has to be right. It writes a negative ledger
 * row rather than editing a running total, so the balance is always the sum of
 * what actually happened and a disputed payment can be traced to the person who
 * recorded it.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ ambassadorId: string }> }) {
  const { ambassadorId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const before = await prisma.ambassador.findUnique({ where: { id: ambassadorId } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  // Recording a payout.
  if (body.payoutXaf != null) {
    const amount = Math.round(Number(body.payoutXaf));
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter the amount you paid" }, { status: 400 });
    }
    const { balanceXaf } = await ambassadorBalance(ambassadorId);
    if (amount > balanceXaf) {
      return NextResponse.json(
        { error: `They are only owed ${balanceXaf} XAF right now` },
        { status: 400 }
      );
    }

    await prisma.ambassadorLedger.create({
      data: {
        ambassadorId,
        amountXaf: -amount,
        type: "PAYOUT",
        note: typeof body.note === "string" ? body.note.slice(0, 300) : null,
        recordedById: user.id,
      },
    });

    await recordAudit({
      actor: { id: user.id, fullName: user.fullName, role: user.role },
      action: "ambassador.paid",
      entityType: "payment",
      entityId: ambassadorId,
      entityLabel: `${before.code} — ${before.fullName}`,
      changes: { paidXaf: { from: null, to: amount } },
      reason: typeof body.note === "string" ? body.note : null,
    });

    return NextResponse.json({ ok: true, ...(await ambassadorBalance(ambassadorId)) });
  }

  // Status and detail changes.
  const data: Record<string, unknown> = {};
  if (["PENDING", "ACTIVE", "SUSPENDED"].includes(body.status)) {
    data.status = body.status;
    if (body.status === "ACTIVE" && before.status !== "ACTIVE") {
      data.approvedAt = new Date();
      data.approvedById = user.id;
    }
  }
  for (const key of ["fullName", "payoutMethod", "payoutNumber", "notes"] as const) {
    if (typeof body[key] === "string") data[key] = body[key];
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  const ambassador = await prisma.ambassador.update({ where: { id: ambassadorId }, data });

  await recordAudit({
    actor: { id: user.id, fullName: user.fullName, role: user.role },
    action: data.status ? "ambassador.status_changed" : "ambassador.updated",
    entityType: "user",
    entityId: ambassadorId,
    entityLabel: `${ambassador.code} — ${ambassador.fullName}`,
    changes: data.status ? { status: { from: before.status, to: data.status } } : undefined,
  });

  return NextResponse.json({ ambassador });
}
