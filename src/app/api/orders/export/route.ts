import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { ordersToCsv } from "@/lib/csv/exportOrders";
import { buildOrderWhere, normalizeFilter } from "@/lib/orders/filters";

/** GET /api/orders/export?filter=... — CSV download (admin only). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filter = normalizeFilter(req.nextUrl.searchParams.get("filter"));
  const orders = await prisma.order.findMany({
    where: buildOrderWhere(filter),
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { fullName: true, whatsappNumber: true } },
      pickupZone: { select: { zoneName: true } },
      deliveryZone: { select: { zoneName: true } },
      assignedRider: { select: { fullName: true } },
    },
  });

  const csv = ordersToCsv(orders);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="urban-night-lift-orders-${date}.csv"`,
    },
  });
}
