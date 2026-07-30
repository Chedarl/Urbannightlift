import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { loadRiderFloat } from "@/lib/riders/floatAccount";
import {
  canTopUpRider,
  riderReturnEntry,
  RIDER_FLOAT_REFUSAL_MESSAGE,
} from "@/lib/riders/float";

export const dynamic = "force-dynamic";

/**
 * A rider's float: read it, grant it, top it up, take it back.
 *
 * This is the mirror of the merchant float and gets the same treatment, because
 * it is the same kind of decision pointed the other way: there, a business owes
 * us for fees we carried; here, a rider is walking around Yaoundé at 1 AM with
 * our cash in their pocket. Both are money moving outside an order, so both are
 * **OWNER-only and audited** — a dispatcher should be able to run a whole night
 * without being able to hand out company money.
 *
 * Until this existed, `src/lib/riders/float.ts` was proven and wired to nothing,
 * which meant there was no way to give a rider a float at all — and therefore no
 * way to complete a real food or pharmacy order.
 */

async function loadRider(riderId: string) {
  return prisma.user.findFirst({
    where: { id: riderId, role: "RIDER" },
    select: { id: true, fullName: true },
  });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ riderId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Reading a balance is part of running the night — dispatch needs to know who
  // can be sent shopping. Changing it is another matter, handled below.
  if (!["OWNER", "DISPATCHER", "SUPPORT"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { riderId } = await ctx.params;
  const state = await loadRiderFloat(riderId);
  if (!state) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entries = await prisma.riderFloatLedger.findMany({
    where: { riderId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, amountXaf: true, type: true, note: true, createdAt: true },
  });

  return NextResponse.json({
    limitXaf: state.limitXaf,
    suspended: state.suspended,
    grantedAt: state.grantedAt,
    balanceXaf: state.balanceXaf,
    advancedXaf: state.advancedXaf,
    spendableXaf: state.spendableXaf,
    headroomXaf: state.headroomXaf,
    entries,
  });
}

/**
 * POST — one of:
 *   { action: "grant", limitXaf }          set or close the ceiling
 *   { action: "suspend" | "resume" }       pause or restore top-ups
 *   { action: "topup", amountXaf, note? }  hand them cash
 *   { action: "return", amountXaf, note? } record cash handed back
 *   { action: "adjust", amountXaf, note }  a deliberate correction, either way
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ riderId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can move float" }, { status: 403 });
  }

  const { riderId } = await ctx.params;
  const [rider, state] = await Promise.all([loadRider(riderId), loadRiderFloat(riderId)]);
  if (!rider || !state) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;

  if (action === "grant") {
    const limitXaf = Math.trunc(Number(body.limitXaf));
    if (!Number.isFinite(limitXaf) || limitXaf < 0) {
      return NextResponse.json({ error: "A float limit must be zero or more" }, { status: 400 });
    }
    // Lowering a limit below what they are already holding is allowed: it stops
    // further top-ups without pretending the cash in their pocket away.
    await prisma.user.update({
      where: { id: riderId },
      data: {
        floatLimitXaf: limitXaf,
        floatGrantedAt: limitXaf > 0 ? new Date() : null,
        floatGrantedByUserId: limitXaf > 0 ? user.id : null,
      },
    });
    await recordAudit({
      entityType: "user",
      entityId: riderId,
      entityLabel: rider.fullName,
      action: limitXaf > 0 ? "RIDER_FLOAT_GRANTED" : "RIDER_FLOAT_CLOSED",
      actor: user,
      reason: `Float limit set to ${limitXaf} XAF`,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "suspend" || action === "resume") {
    await prisma.user.update({
      where: { id: riderId },
      data: { floatSuspended: action === "suspend" },
    });
    await recordAudit({
      entityType: "user",
      entityId: riderId,
      entityLabel: rider.fullName,
      action: action === "suspend" ? "RIDER_FLOAT_SUSPENDED" : "RIDER_FLOAT_RESUMED",
      actor: user,
      reason: note,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "topup") {
    const amountXaf = Math.trunc(Number(body.amountXaf));
    const decision = canTopUpRider(state.account, state.entries, amountXaf);
    if (!decision.ok) {
      return NextResponse.json(
        { error: RIDER_FLOAT_REFUSAL_MESSAGE[decision.refusal!] },
        { status: 400 }
      );
    }
    await prisma.riderFloatLedger.create({
      data: { riderId, amountXaf, type: "TOPUP", note, recordedById: user.id },
    });
    await recordAudit({
      entityType: "user",
      entityId: riderId,
      entityLabel: rider.fullName,
      action: "RIDER_FLOAT_TOPUP",
      actor: user,
      reason: `${amountXaf} XAF handed over${note ? ` — ${note}` : ""}`,
    });
    return NextResponse.json({ ok: true, balanceXaf: state.balanceXaf + amountXaf });
  }

  if (action === "return") {
    const amountXaf = Math.trunc(Number(body.amountXaf));
    // Clamped in the module so a rider can never be recorded as handing back
    // more than they were given, which would read as the company owing them.
    const entry = riderReturnEntry(state.entries, amountXaf);
    if (!entry) {
      return NextResponse.json(
        { error: "They aren't holding anything, or the amount wasn't positive" },
        { status: 400 }
      );
    }
    await prisma.riderFloatLedger.create({
      data: { riderId, amountXaf: entry.amountXaf, type: entry.type, note, recordedById: user.id },
    });
    await recordAudit({
      entityType: "user",
      entityId: riderId,
      entityLabel: rider.fullName,
      action: "RIDER_FLOAT_RETURNED",
      actor: user,
      reason: `${-entry.amountXaf} XAF handed back${note ? ` — ${note}` : ""}`,
    });
    return NextResponse.json({ ok: true, appliedXaf: -entry.amountXaf });
  }

  if (action === "adjust") {
    const amountXaf = Math.trunc(Number(body.amountXaf));
    if (!Number.isFinite(amountXaf) || amountXaf === 0) {
      return NextResponse.json({ error: "An adjustment needs a non-zero amount" }, { status: 400 });
    }
    // A correction moves money on the books, so it has to say why.
    if (!note || note.length < 3) {
      return NextResponse.json({ error: "An adjustment needs a reason" }, { status: 400 });
    }
    await prisma.riderFloatLedger.create({
      data: { riderId, amountXaf, type: "ADJUSTMENT", note, recordedById: user.id },
    });
    await recordAudit({
      entityType: "user",
      entityId: riderId,
      entityLabel: rider.fullName,
      action: "RIDER_FLOAT_ADJUSTED",
      actor: user,
      reason: `${amountXaf} XAF — ${note.slice(0, 120)}`,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
