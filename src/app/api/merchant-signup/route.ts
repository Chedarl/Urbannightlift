import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { intakeMerchant } from "@/lib/merchants/intake";
import { notifyMerchantSignup } from "@/lib/notify/triggers";
import type { MerchantCategory } from "@prisma/client";

/**
 * POST /api/merchant-signup — a business adds itself.
 *
 * This exists because there is no reliable way to find out from the outside
 * whether a shop in Yaoundé is still trading. A map said 959 places existed and
 * most of them did not; the platforms that would know refuse to be queried. The
 * one signal that cannot be faked is the business itself answering — a merchant
 * who fills this in is open tonight, wants the orders, and has just told us
 * their own prices and hours.
 *
 * Everything lands unverified, so the worst a bad submission can do is occupy a
 * line in a queue.
 */

const CATEGORIES: MerchantCategory[] = ["FOOD", "PHARMACY", "GROCERY", "GENERAL_STORE", "OTHER"];

/** One submission per number per hour — enough to fix a typo, not to flood. */
const COOLDOWN_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // A field no human sees and no real submission fills.
  if (typeof body.companyWebsite === "string" && body.companyWebsite.trim()) {
    return NextResponse.json({ ok: true });
  }

  const merchantName = typeof body.merchantName === "string" ? body.merchantName.trim() : "";
  const rawPhone = typeof body.whatsappNumber === "string" ? body.whatsappNumber.trim() : "";
  const category = CATEGORIES.find((c) => c === body.category) ?? "FOOD";

  if (merchantName.length < 2) {
    return NextResponse.json({ error: "Tell us the name of your business." }, { status: 400 });
  }
  const whatsapp = normalizePhone(rawPhone);
  if (whatsapp.length < 11) {
    return NextResponse.json({ error: "A WhatsApp number is needed so we can reach you." }, { status: 400 });
  }
  if (body.acceptedTerms !== true) {
    return NextResponse.json({ error: "Please confirm you represent this business." }, { status: 400 });
  }

  const recent = await prisma.merchant.findFirst({
    where: {
      OR: [{ whatsappNumber: whatsapp }, { phone: whatsapp }],
      updatedAt: { gt: new Date(Date.now() - COOLDOWN_MS) },
      source: "signup",
      verified: false,
    },
    select: { id: true },
  });
  if (recent) {
    return NextResponse.json({
      ok: true,
      alreadyReceived: true,
      message: "We already have your details — we'll be in touch shortly.",
    });
  }

  const products = Array.isArray(body.products)
    ? (body.products as unknown[])
        .map((p) => {
          const row = p as { name?: unknown; priceXaf?: unknown };
          const name = typeof row.name === "string" ? row.name.trim() : "";
          const price = Number(row.priceXaf);
          return name ? { name, priceXaf: Number.isFinite(price) && price > 0 ? price : null } : null;
        })
        .filter((p): p is { name: string; priceXaf: number | null } => p !== null)
    : [];

  const result = await intakeMerchant({
    merchantName,
    category,
    whatsappNumber: whatsapp,
    address: typeof body.address === "string" ? body.address : null,
    neighbourhood: typeof body.neighbourhood === "string" ? body.neighbourhood : null,
    landmark: typeof body.landmark === "string" ? body.landmark : null,
    latitude: typeof body.latitude === "number" ? body.latitude : null,
    longitude: typeof body.longitude === "number" ? body.longitude : null,
    openingHours: typeof body.openingHours === "string" ? body.openingHours : null,
    nightOpen: body.nightOpen !== false,
    open24h: body.open24h === true,
    socialUrl: typeof body.socialUrl === "string" ? body.socialUrl : null,
    logoUrl: typeof body.logoUrl === "string" ? body.logoUrl : null,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : null,
    // A business vouching for itself is a lead, not an approval.
    verified: false,
    source: "signup",
    products,
  });

  await notifyMerchantSignup(result.merchantName, category.toLowerCase().replace("_", " "), result.id);

  return NextResponse.json({ ok: true, merchantId: result.id });
}
