import { prisma } from "@/lib/prisma";
import { CustomersTable } from "@/components/admin/CustomersTable";
import { buildCustomerWhere, CUSTOMERS_PAGE_SIZE } from "@/lib/customers/query";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const where = buildCustomerWhere(q);

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * CUSTOMERS_PAGE_SIZE,
      take: CUSTOMERS_PAGE_SIZE,
      include: {
        _count: { select: { orders: true } },
        orders: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
  ]);

  // Lifetime delivery fees per customer, for the page of customers being shown.
  const fees = await prisma.order.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customers.map((c) => c.id) } },
    _sum: { finalDeliveryFeeXaf: true, estimatedDeliveryFeeXaf: true },
  });
  const feeByCustomer = new Map(
    fees.map((f) => [
      f.customerId,
      f._sum.finalDeliveryFeeXaf ?? f._sum.estimatedDeliveryFeeXaf ?? 0,
    ])
  );

  return (
    <CustomersTable
      query={q}
      page={page}
      pageCount={Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE))}
      total={total}
      rows={customers.map((c) => ({
        id: c.id,
        fullName: c.fullName,
        whatsappNumber: c.whatsappNumber,
        alternativePhone: c.alternativePhone,
        preferredLanguage: c.preferredLanguage,
        totalOrders: c.totalOrders,
        orderCount: c._count.orders,
        lastOrderAt: c.orders[0]?.createdAt.toISOString() ?? null,
        lifetimeFeesXaf: feeByCustomer.get(c.id) ?? 0,
        hasAccount: c.pinHash != null,
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  );
}
