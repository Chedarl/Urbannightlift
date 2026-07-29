import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { readCustomer } from "@/lib/customers/health";
import { normalizePhone } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/crm?q= — find the person on the phone.
 *
 * Somebody rings at 1 AM and says a name, or a number, or an order code, and
 * whichever of those they say has to be enough. Staff previously had to guess
 * which screen to look on, so this searches all three at once and returns
 * people rather than rows — the unit of a support call is a customer, not an
 * order.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ customers: [] });

  // A phone typed as "680 03 80 04", "+237680038004" or "0680038004" is the
  // same person. Everything else keys on the same normalized form, so this must
  // too or the search finds nobody for the most common thing anyone types.
  const phone = normalizePhone(q);
  const looksLikePhone = /\d{6,}/.test(q.replace(/\D/g, ""));

  const byOrder = /^UNL-/i.test(q)
    ? await prisma.order.findFirst({
        where: { orderCode: q.toUpperCase() },
        select: { customerId: true },
      })
    : null;

  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        ...(looksLikePhone
          ? [
              { whatsappNumber: { contains: phone } },
              { whatsappNumber: { contains: q.replace(/\D/g, "") } },
              { alternativePhone: { contains: q.replace(/\D/g, "") } },
            ]
          : []),
        ...(byOrder?.customerId ? [{ id: byOrder.customerId }] : []),
        { referralCode: q.toUpperCase() },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      fullName: true,
      whatsappNumber: true,
      preferredLanguage: true,
      pinHash: true,
      tags: true,
      blockedAt: true,
      createdAt: true,
      referralCreditXaf: true,
      orders: {
        select: { orderStatus: true, createdAt: true, finalDeliveryFeeXaf: true, quotedFeeXaf: true },
      },
      cases: { select: { status: true } },
    },
  });

  return NextResponse.json({
    customers: customers.map((c) => {
      const delivered = c.orders.filter((o) => o.orderStatus === "DELIVERED" || o.orderStatus === "CLOSED");
      const cancelled = c.orders.filter((o) =>
        ["CANCELLED_BY_CUSTOMER", "CANCELLED_BY_UNL", "REJECTED", "FAILED_DELIVERY"].includes(o.orderStatus)
      );
      const read = readCustomer({
        delivered: delivered.length,
        cancelled: cancelled.length,
        complaints: c.cases.length,
        openCases: c.cases.filter((k) => k.status !== "RESOLVED").length,
        lifetimeSpendXaf: delivered.reduce((s, o) => s + (o.finalDeliveryFeeXaf ?? o.quotedFeeXaf ?? 0), 0),
        lastOrderAt: c.orders.length ? c.orders.map((o) => o.createdAt).sort((a, b) => b.getTime() - a.getTime())[0] : null,
        blockedAt: c.blockedAt,
        createdAt: c.createdAt,
      });
      return {
        id: c.id,
        fullName: c.fullName,
        whatsappNumber: c.whatsappNumber,
        language: c.preferredLanguage,
        hasAccount: c.pinHash != null,
        tags: c.tags,
        creditXaf: c.referralCreditXaf,
        delivered: delivered.length,
        ...read,
      };
    }),
  });
}
