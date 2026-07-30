import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { sellTonight, type MerchantOrderFact } from "@/lib/merchants/sellTonight";
import { buildWaLink } from "@/lib/whatsapp/links";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/merchants-crm/[merchantId]/sell-tonight
 *
 * A merchant's own sales picture, ready to send them.
 *
 * The point of this endpoint is the last field: a prefilled WhatsApp link
 * carrying the advice in their language. Computing the numbers is only half the
 * value — the half that grows their business is somebody actually telling them,
 * and that has to be one tap for whoever is on the desk.
 *
 * Item names come out of the structured `serviceDetails` each order form
 * writes. The shapes differ per service (food writes `foodItems`, grocery
 * `groceryItems`, medicine `meds`), so they are normalised here rather than in
 * the logic module, which stays free of storage detail.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ merchantId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { merchantId } = await ctx.params;
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, merchantName: true, whatsappNumber: true, phone: true },
  });
  if (!merchant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const orders = await prisma.order.findMany({
    where: { merchantId },
    select: { createdAt: true, orderStatus: true, isTest: true, serviceDetails: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const facts: MerchantOrderFact[] = orders.map((o) => ({
    createdAt: o.createdAt,
    completed: o.orderStatus === "DELIVERED" || o.orderStatus === "CLOSED",
    isTest: o.isTest,
    items: itemsOf(o.serviceDetails),
  }));

  const report = sellTonight(facts, new Date());

  // The message we would send them, ready to tap. French by default: it is the
  // working language of most Yaoundé businesses, and `Merchant` carries no
  // language preference to read. `?lang=en` switches it for an English merchant.
  const fr = req.nextUrl.searchParams.get("lang") !== "en";
  const lines = report.advice.map((a) => (fr ? a.fr : a.en));
  const message =
    lines.length > 0
      ? `${fr ? "Bonsoir" : "Good evening"} ${merchant.merchantName} — ${
          fr ? "voici vos chiffres Urban Night Lift" : "here are your Urban Night Lift numbers"
        }:\n\n${lines.map((l) => `• ${l}`).join("\n")}`
      : null;
  const number = merchant.whatsappNumber || merchant.phone;

  return NextResponse.json({
    report,
    message,
    waLink: number && message ? buildWaLink(number, message) : null,
  });
}

/**
 * Pull `{ name, qty }` pairs out of whatever shape the service wrote.
 *
 * Unknown shapes yield nothing rather than a guess: a mis-parsed line would
 * become wrong advice to a real business, which is worse than a quieter report.
 */
function itemsOf(details: unknown): { name: string; qty: number }[] {
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
