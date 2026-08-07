import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { readPingToken } from "@/lib/merchants/pingLink";
import { readAvailability } from "@/lib/ai/availability";
import { applyAvailability } from "@/lib/merchants/availabilityApply";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The business answering for itself, with no login.
 *
 * A restaurant will not create an account at 11 PM to tell us the fish ran out.
 * They will tap a link in a WhatsApp message and type four words. So this is
 * gated by a signed, expiring token rather than a session — the same trade the
 * watch link makes, for the same reason.
 *
 * **What a leaked link can reach is deliberately almost nothing:** that one
 * business's own dish names, and the ability to mark them in or out until the
 * token expires. No customer data, no orders, no money, no login. The worst
 * case is one restaurant's menu showing wrong for a night, visible on the admin
 * screen and undone in a tap — set against a restaurant that will actually tell
 * us, which is the thing nobody else in this market has.
 *
 * Applied in one step here, unlike the staff paste: the person typing *is* the
 * business, and there is nobody to check them against.
 */
async function load(token: string) {
  const claim = readPingToken(token);
  if (!claim) return null;

  const merchant = await prisma.merchant.findUnique({
    where: { id: claim.m },
    select: {
      id: true,
      merchantName: true,
      availabilityCheckedAt: true,
      products: {
        where: { available: true },
        orderBy: [{ popularityRank: "desc" }, { name: "asc" }],
        take: 60,
        select: { id: true, name: true, nameFr: true, soldOutAt: true },
      },
    },
  });
  if (!merchant) return null;
  return { claim, merchant };
}

/** GET — their own list, so they can see what we think they have. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await load(token);
  if (!found) return NextResponse.json({ error: "This link has expired." }, { status: 404 });

  return NextResponse.json({
    merchantName: found.merchant.merchantName,
    checkedAt: found.merchant.availabilityCheckedAt,
    items: found.merchant.products.map((p) => ({
      id: p.id,
      name: p.name,
      nameFr: p.nameFr,
      soldOut: p.soldOutAt != null,
    })),
  });
}

/**
 * POST — a sentence, or a set of taps.
 *
 * Both, because both are how a real kitchen answers: some will type "plus de
 * poisson", some will just tap the two dishes that ran out. Taps skip the model
 * entirely — there is nothing to interpret when somebody has pointed at the row.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await load(token);
  if (!found) return NextResponse.json({ error: "This link has expired." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const items = found.merchant.products.map((p) => ({ id: p.id, name: p.name, nameFr: p.nameFr }));
  const allowed = new Set(items.map((i) => i.id));

  // The tapped path. No model, no ambiguity: they pointed at the rows.
  if (Array.isArray(body.soldOutIds)) {
    const soldOut = new Set(
      (body.soldOutIds as unknown[]).filter((id): id is string => typeof id === "string" && allowed.has(id))
    );
    const changes = items.map((i) => ({ itemId: i.id, name: i.name, soldOut: soldOut.has(i.id) }));
    const { changed } = await applyAvailability({
      merchantId: found.merchant.id,
      pingId: found.claim.p,
      changes,
      appliedByUserId: null,
      replyText: body.replyText === undefined ? "(marked on the page)" : String(body.replyText).slice(0, 500),
      source: "merchant",
    });
    return NextResponse.json({ ok: true, changed });
  }

  const replyText = typeof body.replyText === "string" ? body.replyText : "";
  const reading = await readAvailability(replyText, items);
  if (reading.error) return NextResponse.json({ error: reading.error }, { status: 400 });

  /*
   * A dish they named that we do not carry, added straight away.
   *
   * The staff path ticks these first, because somebody pasting a message read
   * on another screen is reporting second-hand. Here the person typing **is**
   * the business: it is their kitchen, their dish and their price, and making
   * them wait for one of us to approve their own menu is the friction that kept
   * this catalogue empty. Same rule as the availability itself, which has
   * applied in one step on this route since it was built.
   */
  let added = 0;
  if (reading.newItems.length > 0) {
    const existing = new Set(items.map((i) => i.name.trim().toLowerCase()));
    const fresh = reading.newItems.filter((n) => !existing.has(n.name.toLowerCase()));
    if (fresh.length > 0) {
      const result = await prisma.merchantProduct.createMany({
        data: fresh.map((n) => ({
          merchantId: found.merchant.id,
          name: n.name,
          priceXaf: n.priceXaf,
          source: "merchant_ping",
        })),
        skipDuplicates: true,
      });
      added = result.count;
    }
  }

  await applyAvailability({
    merchantId: found.merchant.id,
    pingId: found.claim.p,
    changes: reading.changes,
    appliedByUserId: null,
    replyText,
    source: "merchant",
  });

  return NextResponse.json({
    ok: true,
    changed: reading.changes.length,
    added,
    // Their own words back, so somebody who typed a dish we do not carry finds
    // out now rather than wondering why nothing happened.
    unmatched: added > 0 ? [] : reading.unmatched,
  });
}
