import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import type { UserRole } from "@prisma/client";

/**
 * Clearing rehearsal data, permanently.
 *
 * During a trial the catalogue and the customer list fill with things that were
 * never real — a merchant typed twice, an account made to test a form. Until now
 * the only "delete" here deactivated a merchant and there was no way at all to
 * remove a customer, so a rehearsal left permanent residue.
 *
 * **This destroys data and cannot be undone.** It is a hard cascade: the
 * record's orders, payments, receipts and history go with it. That was the
 * owner's explicit choice, and the design follows from it — since nothing is
 * held back, every guard is on the way *in*:
 *
 *  - **OWNER only.** Not `ADMIN_ROLES`. A dispatcher never needs this, and the
 *    smallest set of people who can destroy records is the right set.
 *  - **Test mode only.** The switch that says "we are rehearsing" is the switch
 *    that permits it. Once the business is live, this returns 403 to everybody,
 *    including the owner, and the deploy that turns test mode off closes it.
 *  - **The audit row is written first.** Not last, and not inside the
 *    transaction that removes everything — an `AuditLog` entry describing a
 *    deletion is worthless if it disappears with what it describes.
 *  - **The caller must name the row.** Enforced at the route, because a
 *    destructive action reached by one tap is a destructive action taken by
 *    accident.
 *
 * The counts are gathered before deleting and reported after, so "delete this
 * customer" is never a silent removal of nine orders somebody had forgotten.
 */

export interface DeletionActor {
  id: string;
  fullName: string;
  role: UserRole;
}

export interface Deletion {
  ok: boolean;
  error?: string;
  /** What went with it, so the reply can say what was actually destroyed. */
  removed?: Record<string, number>;
}

/** Only the owner, only while rehearsing. Both, always, on every path. */
export function mayHardDelete(actor: { role: UserRole } | null, testMode: boolean): string | null {
  if (!actor) return "Unauthorized";
  if (actor.role !== "OWNER") return "Only the owner can delete records.";
  if (!testMode) {
    return "Deleting is only possible while test mode is on. Turn it off and this stops working — which is the point.";
  }
  return null;
}

/**
 * Removes a merchant and everything that pointed at it.
 *
 * `Order.merchantId` is a nullable relation rather than a cascade, so the orders
 * are deleted explicitly here — leaving them would keep rows referring to a
 * business that no longer exists, and nulling them would leave an order whose
 * history says nothing about where the food came from. Neither is a record
 * worth keeping.
 */
export async function hardDeleteMerchant(merchantId: string, actor: DeletionActor): Promise<Deletion> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, merchantName: true, _count: { select: { orders: true, products: true } } },
  });
  if (!merchant) return { ok: false, error: "Not found" };

  const removed = {
    orders: merchant._count.orders,
    products: merchant._count.products,
  };

  // Written before anything is destroyed, and deliberately outside the
  // transaction below: a record of a deletion that rolls back with the deletion
  // is not a record.
  await recordAudit({
    actor,
    action: "merchant.hard_deleted",
    entityType: "merchant",
    entityId: merchant.id,
    entityLabel: merchant.merchantName,
    // The audit shape is from → to, and a deletion is everything → nothing.
    changes: Object.fromEntries(Object.entries(removed).map(([k, v]) => [k, { from: v, to: 0 }])),
    reason: "Trial cleanup — permanent delete",
  });

  const orderIds = (
    await prisma.order.findMany({ where: { merchantId }, select: { id: true } })
  ).map((o) => o.id);

  await prisma.$transaction(async (tx) => {
    if (orderIds.length > 0) await deleteOrders(tx, orderIds);
    // Products, duty rows and availability pings cascade from the merchant.
    await tx.merchant.delete({ where: { id: merchantId } });
  });

  return { ok: true, removed };
}

/** Removes a customer, their orders, and everything hanging off them. */
export async function hardDeleteCustomer(customerId: string, actor: DeletionActor): Promise<Deletion> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      fullName: true,
      whatsappNumber: true,
      _count: { select: { orders: true, addresses: true, cases: true } },
    },
  });
  if (!customer) return { ok: false, error: "Not found" };

  const removed = {
    orders: customer._count.orders,
    addresses: customer._count.addresses,
    cases: customer._count.cases,
  };

  await recordAudit({
    actor,
    action: "customer.hard_deleted",
    entityType: "customer",
    entityId: customer.id,
    // The number, not just the name — it is the only thing that identifies a
    // customer uniquely, and the audit row is what remains afterwards.
    entityLabel: `${customer.fullName} (${customer.whatsappNumber})`,
    changes: Object.fromEntries(Object.entries(removed).map(([k, v]) => [k, { from: v, to: 0 }])),
    reason: "Trial cleanup — permanent delete",
  });

  const orderIds = (
    await prisma.order.findMany({ where: { customerId }, select: { id: true } })
  ).map((o) => o.id);

  await prisma.$transaction(async (tx) => {
    if (orderIds.length > 0) await deleteOrders(tx, orderIds);
    // Cases can outlive an order but not their customer. Their messages
    // cascade from the case itself.
    await tx.supportRequest.deleteMany({ where: { customerId } });
    await tx.customer.delete({ where: { id: customerId } });
  });

  return { ok: true, removed };
}

/**
 * Everything that points at an order, in dependency order.
 *
 * Written out rather than left to cascades because several of these relations
 * are deliberately not cascading — a payment should never vanish because
 * somebody edited an order — and a foreign key error at 1 AM during a cleanup
 * is a worse outcome than a slightly longer function.
 */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function deleteOrders(tx: Tx, orderIds: string[]): Promise<void> {
  const where = { orderId: { in: orderIds } };
  // CaseMessage cascades from SupportRequest, so removing the case is enough.
  await tx.supportRequest.deleteMany({ where: { orderId: { in: orderIds } } });
  await tx.incident.deleteMany({ where });
  await tx.deliveryProof.deleteMany({ where });
  await tx.orderStatusHistory.deleteMany({ where });
  await tx.payment.deleteMany({ where });
  await tx.order.deleteMany({ where: { id: { in: orderIds } } });
}
