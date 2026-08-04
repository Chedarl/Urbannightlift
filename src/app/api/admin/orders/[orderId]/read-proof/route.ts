import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { readPaymentProof } from "@/lib/ai/paymentProof";

export const dynamic = "force-dynamic";

/**
 * POST — read the payment screenshot on this order and hand back what it says.
 *
 * Verifying a payment means squinting at a transaction reference on a phone
 * screenshot and typing it into a box, which is slow at 1 AM and is where the
 * "customer pays, then waits for a human to notice" gap actually lives.
 *
 * **Nothing is written.** This route does not touch `paymentStatus`, does not
 * store the reading, and does not mark anything verified — it returns a
 * suggestion for a dispatcher to check against the screenshot they are looking
 * at. "Verified" is the word that sends a rider out with somebody's goods, and
 * a model's reading of an image is not evidence that money arrived.
 *
 * On demand rather than automatic, deliberately: a dispatcher asks for it while
 * they are on the order, which is exactly when it is useful and the only time
 * it is worth paying for.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;

  const payment = await prisma.payment.findFirst({
    where: { orderId, proofScreenshotUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { proofScreenshotUrl: true, amountXaf: true },
  });

  if (!payment?.proofScreenshotUrl) {
    return NextResponse.json({ error: "There is no payment screenshot on this order." }, { status: 404 });
  }

  const { data: reading, error } = await readPaymentProof(payment.proofScreenshotUrl, orderId);
  if (!reading) {
    return NextResponse.json({
      ok: false,
      // The reason, then the reassurance. A dispatcher needs to know whether to
      // retake the screenshot or just type it, and those are different problems.
      error: `${error ?? "Nothing came back."} Type the reference from the image — that is the same as before, nothing is broken.`,
    });
  }

  return NextResponse.json({
    ok: true,
    reading,
    // The comparison a dispatcher would do next anyway. Reported, never acted on.
    expectedXaf: payment.amountXaf,
    amountMatches:
      reading.amountXaf != null && payment.amountXaf != null
        ? reading.amountXaf === payment.amountXaf
        : null,
  });
}
