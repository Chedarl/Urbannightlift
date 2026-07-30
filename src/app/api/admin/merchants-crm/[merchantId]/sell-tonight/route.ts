import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { sellTonight } from "@/lib/merchants/sellTonight";
import { merchantOrderFacts } from "@/lib/merchants/orderFacts";
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

  // Shared with the merchant's own insights screen, so the desk and the shop can
  // never read different numbers off the same orders.
  const report = sellTonight(await merchantOrderFacts(merchantId), new Date());

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
