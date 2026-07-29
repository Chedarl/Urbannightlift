import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { readCustomer, goodwillProblem } from "@/lib/customers/health";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const CLOSED_CASE = ["RESOLVED"];
const FAILED_ORDER = ["CANCELLED_BY_CUSTOMER", "CANCELLED_BY_UNL", "REJECTED", "FAILED_DELIVERY"];

/** One thing that happened to this customer, whatever kind of thing it was. */
interface TimelineEntry {
  kind: "ORDER" | "CASE" | "NOTE" | "CREDIT";
  at: string;
  title: string;
  detail: string;
  tone: "GOOD" | "BAD" | "NEUTRAL";
  href?: string;
}

/**
 * GET /api/admin/crm/[customerId] — everything about one customer, in one call.
 *
 * A support desk cannot help somebody it has to reconstruct from four screens.
 * Orders, complaints, staff notes and money moved all land here as a single
 * chronological thread, because that is the shape of the question actually
 * being asked on the phone: what has happened to this person, and what did we
 * do about it?
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { customerId } = await params;
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        take: 60,
        select: {
          id: true,
          orderCode: true,
          orderStatus: true,
          serviceType: true,
          createdAt: true,
          completedAt: true,
          isTest: true,
          finalDeliveryFeeXaf: true,
          quotedFeeXaf: true,
          estimatedDeliveryFeeXaf: true,
          deliveryLocation: true,
          assignedRider: { select: { fullName: true } },
        },
      },
      cases: {
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true, category: true, status: true, message: true, createdAt: true, orderCode: true },
      },
      staffNotes: { orderBy: { createdAt: "desc" }, take: 60 },
      addresses: { orderBy: { createdAt: "desc" }, select: { id: true, label: true, locationText: true } },
    },
  });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [ledger, friendsBrought] = await Promise.all([
    prisma.referralLedger.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.customer.count({ where: { referredByCustomerId: customerId } }),
  ]);

  const delivered = c.orders.filter((o) => !o.isTest && (o.orderStatus === "DELIVERED" || o.orderStatus === "CLOSED"));
  const cancelled = c.orders.filter((o) => !o.isTest && FAILED_ORDER.includes(o.orderStatus));
  const openCases = c.cases.filter((k) => !CLOSED_CASE.includes(k.status));

  const read = readCustomer({
    delivered: delivered.length,
    cancelled: cancelled.length,
    complaints: c.cases.length,
    openCases: openCases.length,
    lifetimeSpendXaf: delivered.reduce((s, o) => s + (o.finalDeliveryFeeXaf ?? o.quotedFeeXaf ?? 0), 0),
    lastOrderAt: c.orders[0]?.createdAt ?? null,
    blockedAt: c.blockedAt,
    createdAt: c.createdAt,
  });

  // One thread. Sorting four different kinds of thing together is the whole
  // value — a complaint two hours after a delivery only means something when
  // you can see they sit next to each other.
  const timeline: TimelineEntry[] = [
    ...c.orders.map((o): TimelineEntry => ({
      kind: "ORDER",
      at: o.createdAt.toISOString(),
      title: `${o.orderCode}${o.isTest ? " (test)" : ""}`,
      detail: [
        o.serviceType.replace(/_/g, " ").toLowerCase(),
        o.deliveryLocation,
        o.assignedRider?.fullName ? `rider ${o.assignedRider.fullName}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      tone: FAILED_ORDER.includes(o.orderStatus) ? "BAD" : o.orderStatus === "DELIVERED" || o.orderStatus === "CLOSED" ? "GOOD" : "NEUTRAL",
      href: `/admin/orders/${o.id}`,
    })),
    ...c.cases.map((k): TimelineEntry => ({
      kind: "CASE",
      at: k.createdAt.toISOString(),
      title: `Complaint · ${k.category.replace(/_/g, " ").toLowerCase()}`,
      detail: k.message.slice(0, 160),
      tone: CLOSED_CASE.includes(k.status) ? "NEUTRAL" : "BAD",
      href: "/admin/support",
    })),
    ...c.staffNotes.map((n): TimelineEntry => ({
      kind: "NOTE",
      at: n.createdAt.toISOString(),
      title: `${n.authorName} noted`,
      detail: n.body,
      tone: n.kind === "WARNING" ? "BAD" : n.kind === "GOODWILL" ? "GOOD" : "NEUTRAL",
    })),
    ...ledger.map((l): TimelineEntry => ({
      kind: "CREDIT",
      at: l.createdAt.toISOString(),
      title: `${l.amountXaf > 0 ? "+" : ""}${l.amountXaf} XAF · ${l.type.toLowerCase()}`,
      detail: l.note ?? "",
      tone: l.amountXaf > 0 ? "GOOD" : "NEUTRAL",
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return NextResponse.json({
    customer: {
      id: c.id,
      fullName: c.fullName,
      whatsappNumber: c.whatsappNumber,
      alternativePhone: c.alternativePhone,
      language: c.preferredLanguage,
      hasAccount: c.pinHash != null,
      memberSince: c.createdAt,
      lastLoginAt: c.lastLoginAt,
      tags: c.tags,
      blockedAt: c.blockedAt,
      blockedReason: c.blockedReason,
      /// The legacy single note column, still shown so nothing already written
      /// silently disappears the day the note stream arrives.
      legacyNote: c.notes,
      referralCode: c.referralCode,
      creditXaf: c.referralCreditXaf,
      friendsBrought,
      addresses: c.addresses,
    },
    stats: {
      ...read,
      delivered: delivered.length,
      cancelled: cancelled.length,
      openCases: openCases.length,
      lifetimeSpendXaf: delivered.reduce((s, o) => s + (o.finalDeliveryFeeXaf ?? o.quotedFeeXaf ?? 0), 0),
    },
    timeline: timeline.slice(0, 80),
  });
}

/**
 * PATCH /api/admin/crm/[customerId] — the four things a support call ends in.
 *
 * A note, a tag, a goodwill credit, or a block. Each is recorded against the
 * staff member who did it: money moving and somebody being refused service are
 * both decisions a business has to be able to answer for later.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { customerId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, fullName: true, tags: true, referralCreditXaf: true },
  });
  if (!customer) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "note") {
    const note = typeof body.body === "string" ? body.body.trim() : "";
    if (!note) return NextResponse.json({ error: "Write something first." }, { status: 400 });
    const kind = ["GENERAL", "COMPLAINT", "GOODWILL", "WARNING"].includes(body.kind) ? body.kind : "GENERAL";
    await prisma.customerNote.create({
      data: { customerId, authorId: user.id, authorName: user.fullName, body: note.slice(0, 2000), kind },
    });
    await recordAudit({
      actor: user,
      action: "CUSTOMER_NOTE_ADDED",
      entityType: "customer",
      entityId: customerId,
      entityLabel: customer.fullName,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "tags") {
    const tags: string[] = Array.isArray(body.tags)
      ? [...new Set((body.tags as unknown[]).filter((t): t is string => typeof t === "string" && t.length > 0 && t.length <= 24))].slice(0, 8)
      : [];
    await prisma.customer.update({ where: { id: customerId }, data: { tags } });
    await recordAudit({
      actor: user,
      action: "CUSTOMER_TAGS_SET",
      entityType: "customer",
      entityId: customerId,
      entityLabel: customer.fullName,
      changes: { tags: { from: customer.tags, to: tags } },
    });
    return NextResponse.json({ ok: true, tags });
  }

  if (action === "goodwill") {
    const amountXaf = Number(body.amountXaf);
    const problem = goodwillProblem(amountXaf);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (!reason) return NextResponse.json({ error: "Say what this is for." }, { status: 400 });

    // Ledger row and cached balance in one transaction, same discipline as
    // every other movement of this money — the ledger is the truth and the
    // column on the customer is only there to read quickly.
    await prisma.$transaction([
      prisma.referralLedger.create({
        data: { customerId, orderId: null, amountXaf, type: "ADJUSTMENT", note: `Goodwill by ${user.fullName}: ${reason}` },
      }),
      prisma.customer.update({ where: { id: customerId }, data: { referralCreditXaf: { increment: amountXaf } } }),
      prisma.customerNote.create({
        data: {
          customerId,
          authorId: user.id,
          authorName: user.fullName,
          body: `Credited ${amountXaf} XAF — ${reason}`,
          kind: "GOODWILL",
        },
      }),
    ]);
    await recordAudit({
      actor: user,
      action: "CUSTOMER_GOODWILL_CREDITED",
      entityType: "customer",
      entityId: customerId,
      entityLabel: customer.fullName,
      changes: { referralCreditXaf: { from: customer.referralCreditXaf, to: customer.referralCreditXaf + amountXaf } },
      reason,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "block" || action === "unblock") {
    // Refusing to serve somebody is the heaviest thing this screen can do, so
    // it is the owner's call and it always carries a reason.
    if (user.role !== "OWNER") {
      return NextResponse.json({ error: "Only the owner can block a customer." }, { status: 403 });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (action === "block" && !reason) {
      return NextResponse.json({ error: "Say why. A block with no reason cannot be reviewed." }, { status: 400 });
    }
    await prisma.customer.update({
      where: { id: customerId },
      data:
        action === "block"
          ? { blockedAt: new Date(), blockedReason: reason }
          : { blockedAt: null, blockedReason: null },
    });
    await prisma.customerNote.create({
      data: {
        customerId,
        authorId: user.id,
        authorName: user.fullName,
        body: action === "block" ? `Blocked — ${reason}` : "Unblocked",
        kind: "WARNING",
      },
    });
    await recordAudit({
      actor: user,
      action: action === "block" ? "CUSTOMER_BLOCKED" : "CUSTOMER_UNBLOCKED",
      entityType: "customer",
      entityId: customerId,
      entityLabel: customer.fullName,
      reason: reason || undefined,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
