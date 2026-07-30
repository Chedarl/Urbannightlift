import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import {
  canChargeToFloat,
  floatAvailable,
  floatBalance,
  settlementEntry,
  REFUSAL_MESSAGE,
  type FloatEntry,
} from "@/lib/merchants/float";

export const dynamic = "force-dynamic";

/**
 * A merchant's float: read it, grant it, settle it.
 *
 * Granting credit and writing off money are OWNER-only — the same treatment the
 * payment merchant codes already get, and for the same reason: a dispatcher
 * should be able to run a night without being able to lend company money or
 * cancel a debt. Every mutation is audited, because "who gave them a 20,000
 * float" is a question that will eventually be asked.
 *
 * The balance is always summed from the ledger and never stored.
 */

async function loadAccount(merchantId: string) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      id: true,
      merchantName: true,
      floatLimitXaf: true,
      floatSuspended: true,
      floatGrantedAt: true,
    },
  });
  if (!merchant) return null;
  const rows = await prisma.merchantFloatLedger.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, amountXaf: true, type: true, note: true, createdAt: true, orderId: true },
  });
  const entries: FloatEntry[] = rows.map((r) => ({ amountXaf: r.amountXaf, type: r.type as FloatEntry["type"] }));
  const account = { limitXaf: merchant.floatLimitXaf, suspended: merchant.floatSuspended };
  return { merchant, rows, entries, account };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ merchantId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Reading a balance is part of running the night, so any admin role may look.
  if (!["OWNER", "DISPATCHER", "SUPPORT"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { merchantId } = await ctx.params;
  const loaded = await loadAccount(merchantId);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    limitXaf: loaded.merchant.floatLimitXaf,
    suspended: loaded.merchant.floatSuspended,
    grantedAt: loaded.merchant.floatGrantedAt,
    balanceXaf: floatBalance(loaded.entries),
    availableXaf: floatAvailable(loaded.account, loaded.entries),
    entries: loaded.rows,
  });
}

/**
 * POST — one of:
 *   { action: "grant", limitXaf }         set or change the ceiling
 *   { action: "suspend" | "resume" }      pause or restore new charges
 *   { action: "settle", paidXaf, note? }  record money they have paid down
 *   { action: "adjust", amountXaf, note } a deliberate correction, either way
 *
 * There is intentionally no "charge" action here: a float charge belongs to an
 * order, and letting staff hand-charge a float would put money movements
 * outside the order trail.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ merchantId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can change a float" }, { status: 403 });
  }

  const { merchantId } = await ctx.params;
  const loaded = await loadAccount(merchantId);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "grant") {
    const limitXaf = Math.trunc(Number(body.limitXaf));
    if (!Number.isFinite(limitXaf) || limitXaf < 0) {
      return NextResponse.json({ error: "A float limit must be zero or more" }, { status: 400 });
    }
    // Lowering a limit below what they already owe is allowed — it stops new
    // charges without pretending the existing debt away.
    await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        floatLimitXaf: limitXaf,
        floatGrantedAt: limitXaf > 0 ? new Date() : null,
        floatGrantedByUserId: limitXaf > 0 ? user.id : null,
      },
    });
    await recordAudit({
      entityType: "merchant",
      entityId: merchantId,
      action: limitXaf > 0 ? "FLOAT_GRANTED" : "FLOAT_CLOSED",
      actor: user,
      reason: `${loaded.merchant.merchantName}: float limit set to ${limitXaf} XAF`,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "suspend" || action === "resume") {
    await prisma.merchant.update({
      where: { id: merchantId },
      data: { floatSuspended: action === "suspend" },
    });
    await recordAudit({
      entityType: "merchant",
      entityId: merchantId,
      action: action === "suspend" ? "FLOAT_SUSPENDED" : "FLOAT_RESUMED",
      actor: user,
      reason: loaded.merchant.merchantName,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "settle") {
    const paidXaf = Math.trunc(Number(body.paidXaf));
    const entry = settlementEntry(loaded.entries, paidXaf);
    if (!entry) {
      return NextResponse.json(
        { error: "Nothing to settle, or the amount was not positive" },
        { status: 400 }
      );
    }
    await prisma.merchantFloatLedger.create({
      data: {
        merchantId,
        amountXaf: entry.amountXaf,
        type: entry.type,
        note: typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null,
        recordedById: user.id,
      },
    });
    await recordAudit({
      entityType: "merchant",
      entityId: merchantId,
      action: "FLOAT_SETTLED",
      actor: user,
      reason: `${loaded.merchant.merchantName}: settled ${-entry.amountXaf} XAF`,
    });
    return NextResponse.json({ ok: true, appliedXaf: -entry.amountXaf });
  }

  if (action === "adjust") {
    const amountXaf = Math.trunc(Number(body.amountXaf));
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!Number.isFinite(amountXaf) || amountXaf === 0) {
      return NextResponse.json({ error: "An adjustment needs a non-zero amount" }, { status: 400 });
    }
    // A correction moves money on the books, so it has to say why.
    if (note.length < 3) {
      return NextResponse.json({ error: "An adjustment needs a reason" }, { status: 400 });
    }
    await prisma.merchantFloatLedger.create({
      data: { merchantId, amountXaf, type: "ADJUSTMENT", note: note.slice(0, 300), recordedById: user.id },
    });
    await recordAudit({
      entityType: "merchant",
      entityId: merchantId,
      action: "FLOAT_ADJUSTED",
      actor: user,
      reason: `${loaded.merchant.merchantName}: ${amountXaf} XAF — ${note.slice(0, 120)}`,
    });
    return NextResponse.json({ ok: true });
  }

  // Surfaced so a caller that tries to charge from here gets told where charges live.
  if (action === "charge") {
    const amountXaf = Math.trunc(Number(body.amountXaf));
    const decision = canChargeToFloat(loaded.account, loaded.entries, amountXaf);
    return NextResponse.json(
      {
        error: "Float charges are recorded against an order, not from here.",
        wouldHaveBeenAllowed: decision.ok,
        reason: decision.refusal ? REFUSAL_MESSAGE[decision.refusal] : null,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
