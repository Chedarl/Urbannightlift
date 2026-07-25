import { prisma } from "@/lib/prisma";
import { buildOrderWhere, buildOrderSearchWhere, normalizeFilter } from "@/lib/orders/filters";
import { OrdersTable } from "@/components/admin/OrdersTable";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter: filterParam, q = "" } = await searchParams;
  const filter = normalizeFilter(filterParam);
  const search = buildOrderSearchWhere(q);

  const orders = await prisma.order.findMany({
    where: q ? { AND: [buildOrderWhere(filter), search] } : buildOrderWhere(filter),
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      customer: { select: { fullName: true } },
      pickupZone: { select: { zoneName: true } },
      deliveryZone: { select: { zoneName: true } },
      assignedRider: { select: { fullName: true } },
    },
  });

  const rows = orders.map((o) => ({
    id: o.id,
    orderCode: o.orderCode,
    createdAt: o.createdAt.toISOString(),
    customerName: o.customer.fullName,
    serviceType: o.serviceType,
    pickupZone: o.pickupZone?.zoneName ?? "—",
    deliveryZone: o.deliveryZone?.zoneName ?? "—",
    declaredValueXaf: o.declaredValueXaf,
    paymentStatus: o.paymentStatus,
    orderStatus: o.orderStatus,
    riderName: o.assignedRider?.fullName ?? null,
    riskFlag: o.riskFlag,
    highValueFlag: o.highValueFlag,
    isMedicine: o.isMedicine,
  }));

  return <OrdersTable rows={rows} activeFilter={filter} query={q} />;
}
