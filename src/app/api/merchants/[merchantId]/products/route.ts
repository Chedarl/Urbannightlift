import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

/**
 * What a merchant sells, with prices.
 *
 * The reviewer's complaint was that customers order dishes a place doesn't
 * stock and guess at a budget, because nothing in the system knows what the
 * merchant sells. A handful of accurate prices per merchant fixes both.
 */

export interface ProductResult {
  id: string;
  name: string;
  nameFr: string | null;
  priceXaf: number | null;
  unit: string | null;
  photoUrl: string | null;
}

/** GET — public, but only for a merchant customers can actually order from. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { verified: true, active: true },
  });
  if (!merchant?.verified || !merchant.active) return NextResponse.json({ products: [] });

  const products = await prisma.merchantProduct.findMany({
    where: { merchantId, available: true },
    orderBy: [{ popularityRank: "desc" }, { name: "asc" }],
    take: 40,
    select: { id: true, name: true, nameFr: true, priceXaf: true, unit: true, photoUrl: true },
  });
  return NextResponse.json({ products });
}

/** POST — staff: add a product to a merchant. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });

  const price = Number(body.priceXaf);
  const product = await prisma.merchantProduct.create({
    data: {
      merchantId,
      name,
      nameFr: typeof body.nameFr === "string" && body.nameFr.trim() ? body.nameFr.trim() : null,
      // A product with no price is still useful — the customer can order it and
      // dispatch confirms the amount — so a blank price is stored as unknown
      // rather than rejected or silently turned into zero.
      priceXaf: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
      unit: typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : null,
      source: typeof body.source === "string" ? body.source : "admin",
    },
  });

  await recordAudit({
    actor: { id: user.id, fullName: user.fullName, role: user.role },
    action: "merchant.product_added",
    entityType: "merchant",
    entityId: merchantId,
    entityLabel: product.name,
  });

  return NextResponse.json({ product }, { status: 201 });
}

/**
 * PATCH — staff: clear an item for customers to browse, or take it back off.
 *
 * Only meaningful for a pharmacy. Dispensing prescription medicine is
 * controlled, so a pharmacy's price list is not published the way a menu is —
 * each item is cleared individually by a person, and `otcApproved` defaults to
 * false so forgetting to press this hides an item rather than exposing one.
 * Audited, because "who said this was over-the-counter" is a question that could
 * one day need an answer.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const productId = typeof body.productId === "string" ? body.productId : "";
  const otcApproved = body.otcApproved === true;
  if (!productId) return NextResponse.json({ error: "No product given" }, { status: 400 });

  // Scoped to the merchant in the path, so a stray id cannot flip somebody
  // else's product onto a browsing page.
  const updated = await prisma.merchantProduct.updateMany({
    where: { id: productId, merchantId },
    data: { otcApproved },
  });
  if (updated.count === 0) return NextResponse.json({ error: "No such product" }, { status: 404 });

  await recordAudit({
    actor: { id: user.id, fullName: user.fullName, role: user.role },
    action: otcApproved ? "merchant.product_otc_cleared" : "merchant.product_otc_withdrawn",
    entityType: "merchant",
    entityId: merchantId,
    entityLabel: productId,
  });

  return NextResponse.json({ ok: true });
}

/** DELETE — staff: remove a product (?productId=). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const productId = req.nextUrl.searchParams.get("productId") ?? "";
  // Scoped to the merchant in the path so a stray id can't delete someone
  // else's product.
  await prisma.merchantProduct.deleteMany({ where: { id: productId, merchantId } });
  return NextResponse.json({ ok: true });
}
