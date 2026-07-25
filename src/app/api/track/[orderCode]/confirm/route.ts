import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { hasOrderAccess } from "@/lib/orders/orderAccess";
import { sendPush } from "@/lib/notify/push";
import { recordAudit } from "@/lib/audit";

/**
 * POST /api/track/[orderCode]/confirm — the customer confirms they received
 * their goods.
 *
 * The rider's delivery proof records that we handed something over. This
 * records that the customer got what they asked for, from their own device.
 * Together they are the only pair of facts that settles a "it never arrived"
 * dispute, so this is a core step, not a nicety.
 *
 * Three ways to confirm, because in the field one of them always fails:
 *   CODE      — they type the delivery code we issued (strongest: only they have it)
 *   SIGNATURE — they sign on their screen
 *   PHOTO     — they photograph the handover
 *
 * The code is compared server-side and is never returned by this endpoint.
 */

const DISPATCH_ROLES = ["OWNER", "DISPATCHER", "SUPPORT"];
const METHODS = ["CODE", "SIGNATURE", "PHOTO"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  const body = await req.json().catch(() => ({}));

  const method = typeof body.method === "string" && METHODS.includes(body.method) ? body.method : null;
  if (!method) return NextResponse.json({ error: "Choose how to confirm" }, { status: 400 });

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const proofUrl = typeof body.proofUrl === "string" ? body.proofUrl.trim().slice(0, 500) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";

  const order = await prisma.order.findUnique({
    where: { orderCode: orderCode.toUpperCase() },
    select: {
      id: true,
      orderCode: true,
      orderStatus: true,
      otpCode: true,
      customerId: true,
      customerConfirmedAt: true,
      assignedRiderId: true,
      customer: { select: { fullName: true, whatsappNumber: true } },
    },
  });
  if (!order) return NextResponse.json({ found: false }, { status: 404 });

  const claimedPhone = normalizePhone(typeof body.whatsappNumber === "string" ? body.whatsappNumber : "");
  const owns =
    (await hasOrderAccess(orderCode)) ||
    (claimedPhone.length > 0 && normalizePhone(order.customer.whatsappNumber) === claimedPhone);
  if (!owns) return NextResponse.json({ error: "Verification required" }, { status: 403 });

  if (order.customerConfirmedAt) {
    return NextResponse.json({ ok: true, alreadyConfirmed: true });
  }

  // Confirming before the rider is even on the way would make the record
  // meaningless.
  const CONFIRMABLE = [
    "RIDER_ARRIVED_AT_DELIVERY",
    "DELIVERY_PROOF_SUBMITTED",
    "DELIVERED",
    "RIDER_GOING_TO_DELIVERY",
  ];
  if (!CONFIRMABLE.includes(order.orderStatus)) {
    return NextResponse.json(
      { error: "You can confirm once your rider is on the way with your order", code: "TOO_EARLY" },
      { status: 409 }
    );
  }

  if (method === "CODE") {
    if (!order.otpCode) {
      return NextResponse.json({ error: "No delivery code on this order" }, { status: 409 });
    }
    if (code !== order.otpCode) {
      return NextResponse.json({ error: "That code doesn't match. Check the digits and try again." }, { status: 400 });
    }
  } else if (!proofUrl) {
    return NextResponse.json({ error: "Upload your signature or photo first" }, { status: 400 });
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        customerConfirmedAt: now,
        customerConfirmMethod: method,
        customerProofUrl: method === "CODE" ? null : proofUrl,
        customerConfirmNote: note || null,
      },
    });

    // The customer's confirmation is itself delivery proof, so a rider who
    // could not complete the handover on their own device is not blocked.
    await tx.deliveryProof.create({
      data: {
        orderId: order.id,
        stage: "DELIVERY",
        proofMethod: method === "PHOTO" ? "PHOTO" : "OTP",
        otpEntered: method === "CODE" ? code : null,
        photoUrl: method === "CODE" ? null : proofUrl,
        riderNote: `Confirmed by the customer (${method.toLowerCase()})`,
      },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.orderStatus,
        toStatus: order.orderStatus === "DELIVERED" ? "DELIVERED" : "DELIVERY_PROOF_SUBMITTED",
        changedByRole: "CUSTOMER",
        note: `Customer confirmed receipt (${method.toLowerCase()})`,
      },
    });

    if (order.orderStatus !== "DELIVERED") {
      await tx.order.update({
        where: { id: order.id },
        data: { orderStatus: "DELIVERY_PROOF_SUBMITTED" },
      });
    }
  });

  await recordAudit({
    actor: { fullName: order.customer.fullName, role: "CUSTOMER" },
    action: "order.receipt_confirmed",
    entityType: "order",
    entityId: order.id,
    entityLabel: order.orderCode,
    changes: { customerConfirmMethod: { from: null, to: method } },
    reason: note || null,
  });

  await sendPush(
    { roles: DISPATCH_ROLES, ...(order.assignedRiderId ? { userIds: [order.assignedRiderId] } : {}) },
    {
      title: `${order.orderCode} confirmed received`,
      body: `${order.customer.fullName} confirmed delivery by ${method.toLowerCase()}.`,
      url: `/admin/orders/${order.id}`,
      tag: `confirmed-${order.id}`,
    }
  ).catch(() => 0);

  return NextResponse.json({ ok: true, confirmedAt: now });
}
