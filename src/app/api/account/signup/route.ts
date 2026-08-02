import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { createCustomerSession, hashPin, isValidPin } from "@/lib/auth/customer";
import { emailNewCustomer } from "@/lib/email/operations";
import { sendWelcome } from "@/lib/welcome/deliver";
import { bindReferral, ensureReferralCode } from "@/lib/referrals/accrual";

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

  // Everybody gets a code the moment they have an account — a referral scheme
  // nobody can find is a referral scheme nobody uses. Never let this break
  // signing up.
  const referralCode = await ensureReferralCode(customer.id).catch(() => null);

  // If somebody sent them, record who — once, permanently.
  let friendDiscountXaf = 0;
  if (typeof body.referralCode === "string" && body.referralCode.trim()) {
    const bound = await bindReferral(customer.id, body.referralCode).catch(() => null);
    friendDiscountXaf = bound?.friendDiscountXaf ?? 0;
  }

  await emailNewCustomer(customer.id).catch(() => {});

  // Welcomes them on WhatsApp — but only once the Meta Cloud API is configured.
  // On click-to-chat this does nothing at all (a `wa.me` link cannot send
  // itself), and the account instead appears in the admin welcome queue for
  // somebody to send with one tap. Either way it can never fail a signup.
  await sendWelcome("customer", customer.id).catch(() => {});

  const claimedOrders = existing ? await prisma.order.count({ where: { customerId: customer.id } }) : 0;
  return NextResponse.json({ ok: true, claimedOrders, referralCode, friendDiscountXaf }, { status: 201 });
}
