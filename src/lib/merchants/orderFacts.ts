import "server-only";

import { prisma } from "@/lib/prisma";
import type { MerchantOrderFact } from "@/lib/merchants/sellTonight";

/**
 * A merchant's orders, in the shape the sell-tonight logic wants.
 *
 * Shared by the admin CRM and the merchant's own insights screen. They must not
 * disagree: a merchant reading "your sales are fading" on their phone while the
 * desk sees "steady" is worse than either of them showing nothing.
 */

/**
 * Pull `{ name, qty }` pairs out of whatever shape the service wrote.
 *
 * Each order form writes its own key — food writes `foodItems`, grocery
 * `groceryItems`, medicine `meds` — so the normalising lives here rather than in
 * the logic module, which stays free of storage detail. Unknown shapes yield
 * nothing rather than a guess: a mis-parsed line becomes wrong advice to a real
 * business, which is worse than a quieter report.
 */
export function itemsOf(details: unknown): { name: string; qty: number }[] {
  if (!details || typeof details !== "object") return [];
  const d = details as Record<string, unknown>;
  const lists = ["foodItems", "groceryItems", "meds", "items", "products"];
  const out: { name: string; qty: number }[] = [];
  for (const key of lists) {
    const list = d[key];
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (!name) continue;
      const qty = Number(r.qty);
      out.push({ name, qty: Number.isFinite(qty) && qty > 0 ? qty : 1 });
    }
  }
  return out;
}

export async function merchantOrderFacts(merchantId: string): Promise<MerchantOrderFact[]> {
  const orders = await prisma.order.findMany({
    where: { merchantId },
    select: { createdAt: true, orderStatus: true, isTest: true, serviceDetails: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return orders.map((o) => ({
    createdAt: o.createdAt,
    completed: o.orderStatus === "DELIVERED" || o.orderStatus === "CLOSED",
    isTest: o.isTest,
    items: itemsOf(o.serviceDetails),
  }));
}
