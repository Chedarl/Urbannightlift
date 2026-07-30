import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import {
  clearMerchantSession,
  createMerchantSession,
  getCurrentMerchant,
  hashPin,
  isValidPin,
  lockState,
  registerFailedAttempt,
  registerSuccessfulLogin,
  verifyPin,
} from "@/lib/auth/merchant";

export const dynamic = "force-dynamic";

/**
 * The merchant's way in: claim an account, log in, log out, or check who I am.
 *
 * One route with an `action` rather than four files, because the four are the
 * same twenty lines of phone-lookup with a different ending, and splitting them
 * mostly duplicates the part that must not drift — how a phone number becomes a
 * merchant.
 *
 * The refusals are deliberately vague in one direction and specific in the
 * other. "We don't have that number" is safe to say: a business phone number is
 * already public and a merchant who mistyped needs to know. "Wrong PIN" versus
 * "no account" is not distinguished on login, so the endpoint cannot be used to
 * enumerate which of our merchants have signed up.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "logout") {
    await clearMerchantSession();
    return NextResponse.json({ ok: true });
  }

  const phone = normalizePhone(typeof body.whatsappNumber === "string" ? body.whatsappNumber : "");
  const pin = typeof body.pin === "string" ? body.pin : "";

  if (action !== "claim" && action !== "login") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (phone.length < 8) {
    return NextResponse.json({ error: "Enter the WhatsApp number we have for your business." }, { status: 400 });
  }
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: "Your PIN is 4 to 6 digits." }, { status: 400 });
  }

  // The stored number may have been typed by hand in admin, so match on the
  // normalized form rather than trusting the two strings to be identical.
  const candidates = await prisma.merchant.findMany({
    where: { active: true },
    select: {
      id: true,
      merchantName: true,
      whatsappNumber: true,
      phone: true,
      verified: true,
      pinHash: true,
      pinAttempts: true,
      pinLockedUntil: true,
    },
  });
  const merchant = candidates.find(
    (m) => normalizePhone(m.whatsappNumber) === phone || (m.phone && normalizePhone(m.phone) === phone)
  );

  if (!merchant) {
    return NextResponse.json(
      {
        error:
          "We don't have a business with that number yet. Sign your shop up first, and we'll call to confirm it.",
        needsSignup: true,
      },
      { status: 404 }
    );
  }

  const lock = lockState(merchant);
  if (lock.locked) {
    return NextResponse.json(
      { error: `Too many wrong PINs. Try again in ${lock.minutesLeft} minutes.` },
      { status: 429 }
    );
  }

  if (action === "claim") {
    // Verification is where a human confirms this business is real and trading.
    // Without that gate, anyone who filled in /merchant/join could put prices in
    // front of customers.
    if (!merchant.verified) {
      return NextResponse.json(
        {
          error:
            "We haven't confirmed your business yet. We'll call the number you gave us, and you can set a PIN straight after.",
        },
        { status: 403 }
      );
    }
    if (merchant.pinHash) {
      return NextResponse.json(
        { error: "This business already has a PIN. Log in instead.", alreadyClaimed: true },
        { status: 409 }
      );
    }
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { pinHash: await hashPin(pin), pinAttempts: 0, pinLockedUntil: null, lastLoginAt: new Date() },
    });
    await createMerchantSession(merchant.id);
    return NextResponse.json({ ok: true, merchantName: merchant.merchantName });
  }

  // login
  if (!merchant.pinHash || !(await verifyPin(pin, merchant.pinHash))) {
    // Only count an attempt against a real account; otherwise a typo'd number
    // would lock out a business that has nothing to do with it.
    if (merchant.pinHash) {
      const after = await registerFailedAttempt(merchant as never);
      if (after.locked) {
        return NextResponse.json(
          { error: `Too many wrong PINs. Try again in ${after.minutesLeft} minutes.` },
          { status: 429 }
        );
      }
    }
    return NextResponse.json({ error: "That number and PIN don't match." }, { status: 401 });
  }
  if (!merchant.verified) {
    return NextResponse.json(
      { error: "Your business is paused with us. Call dispatch and we'll sort it out." },
      { status: 403 }
    );
  }

  await registerSuccessfulLogin(merchant.id);
  await createMerchantSession(merchant.id);
  return NextResponse.json({ ok: true, merchantName: merchant.merchantName });
}

/** GET — who is signed in, for the client shell. */
export async function GET() {
  const merchant = await getCurrentMerchant();
  if (!merchant) return NextResponse.json({ signedIn: false });
  return NextResponse.json({
    signedIn: true,
    id: merchant.id,
    merchantName: merchant.merchantName,
    acceptingOrders: merchant.acceptingOrders,
  });
}
