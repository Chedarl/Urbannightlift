import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { buildCustomerWhere } from "@/lib/customers/query";

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** GET /api/customers/export?q=... — customer database as CSV (dispatch only). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const customers = await prisma.customer.findMany({
    where: buildCustomerWhere(q),
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { orders: true } },
      orders: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });

  const fees = await prisma.order.groupBy({
    by: ["customerId"],
    _sum: { finalDeliveryFeeXaf: true, estimatedDeliveryFeeXaf: true },
  });
  const feeByCustomer = new Map(
    fees.map((f) => [f.customerId, f._sum.finalDeliveryFeeXaf ?? f._sum.estimatedDeliveryFeeXaf ?? 0])
  );

  const header = [
    "Full name",
    "WhatsApp number",
    "Alternative phone",
    "Language",
    "Orders",
    "Last order",
    "Delivery fees (XAF)",
    "First seen",
  ];
  const lines = [header.join(",")];
  for (const c of customers) {
    lines.push(
      [
        c.fullName,
        c.whatsappNumber,
        c.alternativePhone ?? "",
        c.preferredLanguage,
        c._count.orders,
        c.orders[0]?.createdAt.toISOString().slice(0, 10) ?? "",
        feeByCustomer.get(c.id) ?? 0,
        c.createdAt.toISOString().slice(0, 10),
      ]
        .map(csvCell)
        .join(",")
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="urban-night-lift-customers-${date}.csv"`,
    },
  });
}
