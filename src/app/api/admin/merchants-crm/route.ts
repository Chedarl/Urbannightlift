import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { byStanding, readMerchant } from "@/lib/merchants/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/merchants-crm — merchants as relationships.
 *
 * Order metrics come from two grouped queries rather than a query per merchant,
 * so the whole catalogue reads in two round-trips. Unverified signups lead the
 * list (the best leads), then whoever has gone most quiet.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

  const merchants = await prisma.merchant.findMany({
    orderBy: { updatedAt: "desc" },
    take: 400,
    select: {
      id: true,
      merchantName: true,
      category: true,
      neighbourhood: true,
      whatsappNumber: true,
      phone: true,
      logoUrl: true,
      socialUrl: true,
      verified: true,
      active: true,
      acceptingOrders: true,
      nightOpen: true,
      source: true,
      lastConfirmedAt: true,
      createdAt: true,
      _count: { select: { staffNotes: true } },
    },
  });

  // Two grouped passes over real (non-test) orders that name a merchant.
  const where = { merchantId: { not: null }, isTest: false } as const;
  const [totals, perCustomer] = await Promise.all([
    prisma.order.groupBy({ by: ["merchantId"], where, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.order.groupBy({ by: ["merchantId", "customerId"], where, _count: { _all: true } }),
  ]);

  const totalOf = new Map<string, { count: number; last: Date | null }>();
  for (const t of totals) if (t.merchantId) totalOf.set(t.merchantId, { count: t._count._all, last: t._max.createdAt });

  const customers = new Map<string, { unique: number; repeat: number }>();
  for (const row of perCustomer) {
    if (!row.merchantId) continue;
    const c = customers.get(row.merchantId) ?? { unique: 0, repeat: 0 };
    c.unique += 1;
    if (row._count._all > 1) c.repeat += 1;
    customers.set(row.merchantId, c);
  }

  const list = merchants
    .filter((m) => !q || m.merchantName.toLowerCase().includes(q) || (m.neighbourhood ?? "").toLowerCase().includes(q))
    .map((m) => {
      const t = totalOf.get(m.id);
      const c = customers.get(m.id);
      const read = readMerchant(
        {
          verified: m.verified,
          acceptingOrders: m.acceptingOrders,
          orderCount: t?.count ?? 0,
          uniqueCustomers: c?.unique ?? 0,
          repeatCustomers: c?.repeat ?? 0,
          lastOrderAt: t?.last ?? null,
          lastConfirmedAt: m.lastConfirmedAt,
          createdAt: m.createdAt,
        },
        now
      );
      return {
        id: m.id,
        name: m.merchantName,
        category: m.category,
        neighbourhood: m.neighbourhood,
        whatsappNumber: m.whatsappNumber,
        phone: m.phone,
        logoUrl: m.logoUrl,
        socialUrl: m.socialUrl,
        verified: m.verified,
        active: m.active,
        acceptingOrders: m.acceptingOrders,
        nightOpen: m.nightOpen,
        source: m.source,
        orderCount: t?.count ?? 0,
        notesCount: m._count.staffNotes,
        ...read,
      };
    })
    .sort(byStanding);

  return NextResponse.json({
    now: now.toISOString(),
    counts: {
      unverified: list.filter((m) => !m.verified).length,
      quiet: list.filter((m) => m.standing === "QUIET" || m.standing === "DORMANT").length,
      staleContact: list.filter((m) => m.verified && m.contactStale).length,
      total: list.length,
    },
    merchants: list.slice(0, 200),
  });
}
