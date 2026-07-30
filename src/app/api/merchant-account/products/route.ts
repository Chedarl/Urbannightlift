import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentMerchant } from "@/lib/auth/merchant";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * A merchant's own price list, edited by the merchant.
 *
 * Separate from `/api/merchants/[merchantId]/products` on purpose. That route
 * takes a merchant id from the URL and checks the caller is staff. This one
 * takes **no id at all** — it reads the merchant from their session, so there is
 * no parameter for one shop to point at another's products. Adding a
 * merchant-session branch to the staff route would have meant every handler
 * there carrying an "and is it their own?" check that is only ever one mistake
 * away from being forgotten.
 *
 * Capped at a small number of items, deliberately. Five accurate prices beat a
 * forty-line menu that went stale in March, and a short list is one a busy shop
 * will actually keep current.
 */

const MAX_PRODUCTS = 12;

export async function GET() {
  const merchant = await getCurrentMerchant();
  if (!merchant) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const products = await prisma.merchantProduct.findMany({
    where: { merchantId: merchant.id },
    orderBy: [{ popularityRank: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nameFr: true,
      priceXaf: true,
      unit: true,
      available: true,
      photoUrl: true,
    },
  });
  return NextResponse.json({ products, max: MAX_PRODUCTS });
}

export async function POST(req: NextRequest) {
  const merchant = await getCurrentMerchant();
  if (!merchant) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return NextResponse.json({ error: "Give the item a name." }, { status: 400 });

  const count = await prisma.merchantProduct.count({ where: { merchantId: merchant.id } });
  if (count >= MAX_PRODUCTS) {
    return NextResponse.json(
      { error: `You can list ${MAX_PRODUCTS} items. Remove one to add another.` },
      { status: 409 }
    );
  }

  const price = Number(body.priceXaf);
  const product = await prisma.merchantProduct.create({
    data: {
      merchantId: merchant.id,
      name,
      // A price we are not sure of is worse than no price: the customer sets
      // their spending cap from it. Blank stays blank and dispatch confirms.
      priceXaf: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
      unit: typeof body.unit === "string" && body.unit.trim() ? body.unit.trim().slice(0, 40) : null,
      source: "merchant",
    },
  });

  await prisma.merchant.update({
    where: { id: merchant.id },
    data: { lastConfirmedAt: new Date(), lastSeenActiveAt: new Date() },
  });
  await recordAudit({
    entityType: "merchant",
    entityId: merchant.id,
    entityLabel: merchant.merchantName,
    action: "MERCHANT_PRODUCT_ADDED",
    actor: null,
    reason: product.name,
  });

  return NextResponse.json({ product }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const merchant = await getCurrentMerchant();
  if (!merchant) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which item?" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120);
  if (typeof body.available === "boolean") data.available = body.available;
  if (body.priceXaf !== undefined) {
    const price = Number(body.priceXaf);
    data.priceXaf = Number.isFinite(price) && price > 0 ? Math.round(price) : null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  // Scoped by merchantId as well as id, so a guessed product id from another
  // shop updates nothing rather than someone else's price.
  const { count } = await prisma.merchantProduct.updateMany({
    where: { id, merchantId: merchant.id },
    data,
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.merchant.update({
    where: { id: merchant.id },
    data: { lastConfirmedAt: new Date(), lastSeenActiveAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const merchant = await getCurrentMerchant();
  if (!merchant) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id") ?? "";
  await prisma.merchantProduct.deleteMany({ where: { id, merchantId: merchant.id } });
  return NextResponse.json({ ok: true });
}
