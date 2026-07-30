import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { readCase, type CasePriority, type CaseStatus } from "@/lib/support/sla";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/insights — the numbers that tell the desk whether it is
 * winning: are we answering people in time, are they happy, and is the
 * relationship base healthy. Honest metrics only — computed from what we
 * actually record, not invented.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86_400_000);
  const d30 = new Date(now.getTime() - 30 * 86_400_000);

  const [openCases, recentCases, ratings, blockedCustomers, openCaseCustomers, merchants] = await Promise.all([
    prisma.supportRequest.findMany({
      where: { status: { in: ["NEW", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] } },
      select: { status: true, priority: true, createdAt: true, lastCustomerMessageAt: true, lastStaffMessageAt: true },
    }),
    prisma.supportRequest.findMany({
      where: { createdAt: { gte: d7 } },
      select: { createdAt: true, lastStaffMessageAt: true, resolvedAt: true },
    }),
    prisma.order.findMany({
      where: { ratedAt: { gte: d30 }, isTest: false },
      select: { ratingStars: true },
    }),
    prisma.customer.count({ where: { blockedAt: { not: null } } }),
    prisma.supportRequest.findMany({
      where: { status: { in: ["NEW", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] }, customerId: { not: null } },
      select: { customerId: true },
      distinct: ["customerId"],
    }),
    prisma.merchant.findMany({ where: { verified: true }, select: { lastConfirmedAt: true } }),
  ]);

  // Cases: how many are breaching their promise right now.
  const breached = openCases.filter(
    (c) =>
      readCase(
        {
          status: c.status as CaseStatus,
          priority: c.priority as CasePriority,
          createdAt: c.createdAt,
          lastCustomerMessageAt: c.lastCustomerMessageAt,
          lastStaffMessageAt: c.lastStaffMessageAt,
        },
        now
      ).sla === "BREACHED"
  ).length;

  // First response: minutes from a case arriving to the first staff reply,
  // over cases opened in the last week that have had one.
  const answered = recentCases.filter((c) => c.lastStaffMessageAt);
  const firstResponseMins = answered.map((c) => Math.max(0, (c.lastStaffMessageAt!.getTime() - c.createdAt.getTime()) / 60_000));
  const avgFirstResponseMin = firstResponseMins.length
    ? Math.round(firstResponseMins.reduce((s, m) => s + m, 0) / firstResponseMins.length)
    : null;
  const resolved7d = recentCases.filter((c) => c.resolvedAt).length;

  // CSAT over 30 days.
  const stars = ratings.map((r) => r.ratingStars ?? 0).filter((s) => s > 0);
  const csat = stars.length ? Math.round((stars.reduce((s, n) => s + n, 0) / stars.length) * 10) / 10 : null;

  const staleMerchants = merchants.filter(
    (m) => !m.lastConfirmedAt || now.getTime() - m.lastConfirmedAt.getTime() > 60 * 86_400_000
  ).length;

  return NextResponse.json({
    cases: {
      open: openCases.length,
      breached,
      resolved7d,
      avgFirstResponseMin,
    },
    satisfaction: {
      csat,
      ratings30d: stars.length,
      fiveStar: stars.filter((s) => s === 5).length,
      lowStar: stars.filter((s) => s <= 2).length,
    },
    relationships: {
      customersWithOpenCase: openCaseCustomers.length,
      blockedCustomers,
      staleMerchants,
    },
  });
}
