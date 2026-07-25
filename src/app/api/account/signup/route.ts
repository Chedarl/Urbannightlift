import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { createCustomerSession, hashPin, isValidPin } from "@/lib/auth/customer";

/**
 * POST /api/account/signup — create (or claim) a customer account.
 *
 * If a guest already ordered with this WhatsApp number, setting a PIN claims
 * that existing Customer row, so their past orders appear in history straight
 * away. If an account already exists, the caller is told to log in instead.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const whatsappNumber = normalizePhone(typeof body.whatsappNumber === "string" ? body.whatsappNumber : "");
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const preferredLanguage = body.preferredLanguage === "FR" ? "FR" : "EN";

  if (whatsappNumber.length < 8) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: "invalid_pin" }, { status: 400 });
  }
  if (fullName.length < 2) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  const existing = await prisma.customer.findUnique({ where: { whatsappNumber } });

  if (existing?.pinHash) {
    return NextResponse.json({ error: "account_exists" }, { status: 409 });
  }

  const pinHash = await hashPin(pin);

  const customer = existing
    ? await prisma.customer.update({
        where: { id: existing.id },
        // Claim the guest row. Prefer the name they just gave us.
        data: { pinHash, fullName, preferredLanguage, pinAttempts: 0, pinLockedUntil: null },
      })
    : await prisma.customer.create({
        data: { fullName, whatsappNumber, preferredLanguage, pinHash },
      });

  await createCustomerSession(customer.id);

  const claimedOrders = existing ? await prisma.order.count({ where: { customerId: customer.id } }) : 0;
  return NextResponse.json({ ok: true, claimedOrders }, { status: 201 });
}
