import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { notifyCustomerStatus } from "@/lib/notify/triggers";
import { sendPush } from "@/lib/notify/push";

/**
 * POST /api/support/[requestId]/reply — staff answer a case.
 *
 * Two kinds of message land here. A reply reaches the customer on their order
 * page and pushes a notification to them; an internal note stays on the same
 * timeline for staff only, so context does not have to live in someone's head
 * or a separate WhatsApp thread.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { requestId } = await params;
  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
  const internal = body.internal === true;
  if (message.length < 1) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const caseRow = await prisma.supportRequest.findUnique({
    where: { id: requestId },
    select: { id: true, customerId: true, orderCode: true },
  });
  if (!caseRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  await prisma.$transaction([
    prisma.caseMessage.create({
      data: {
        caseId: requestId,
        body: message,
        authorType: "STAFF",
        authorUserId: user.id,
        authorName: user.fullName,
        internal,
      },
    }),
    prisma.supportRequest.update({
      where: { id: requestId },
      data: {
        // An internal note is not an answer, so it must not clear the
        // "waiting on us" flag.
        ...(internal ? {} : { lastStaffMessageAt: now, status: "IN_PROGRESS" }),
        assignedToUserId: user.id,
        handledByUserId: user.id,
      },
    }),
  ]);

  if (!internal && caseRow.customerId) {
    if (caseRow.orderCode) {
      await notifyCustomerStatus(
        caseRow.customerId,
        caseRow.orderCode,
        "We've replied to your message — tap to read it."
      );
    } else {
      await sendPush(
        { customerIds: [caseRow.customerId] },
        {
          title: "Urban Night Lift support",
          body: "We've replied to your message.",
          url: "/help",
          tag: `case-reply-${requestId}`,
        }
      ).catch(() => 0);
    }
  }

  return NextResponse.json({ ok: true });
}
