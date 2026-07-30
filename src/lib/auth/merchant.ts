import "server-only";

import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { MERCHANT_COOKIE, merchantSessionSecret, verifyMerchantToken } from "@/lib/auth/merchantToken";
import type { Merchant } from "@prisma/client";

export { MERCHANT_COOKIE, verifyMerchantToken };

/**
 * Merchant accounts — the SMB half of the business, which had no way in at all.
 *
 * Everything a shop might want to do was built and then locked behind `/admin`:
 * their float, their products and prices, the sell-tonight advice, the switch
 * that says the kitchen is closed. A merchant who wanted a price changed had to
 * phone the owner. That is not a partnership, it is a bottleneck.
 *
 * The mechanics are deliberately identical to `customer.ts` — WhatsApp number
 * plus a short PIN, no SMS cost, an attempt lockout because a business number is
 * public — because a merchant is a customer of a different product, and two
 * different login systems is one more thing to get wrong.
 *
 * Two rules that are specific to merchants:
 *
 *  - **Only a verified merchant can claim an account.** Verification is where a
 *    human confirms the business is real and trading. Letting an unverified
 *    signup log in would mean anyone who filled in `/merchant/join` could put
 *    prices in front of customers.
 *  - **Claiming is not creating.** The row already exists, from a signup or from
 *    an admin adding them. Setting a PIN attaches a login to it, so the shop's
 *    history and float come with them.
 *
 * SECURITY: this PIN is an Urban Night Lift login PIN only. The app must never
 * ask for or store a MoMo/Orange Money PIN, OTP, or bank password.
 */

const SESSION_DAYS = 90;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export const PIN_MIN = 4;
export const PIN_MAX = 6;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

export async function createMerchantSession(merchantId: string): Promise<void> {
  const token = await new SignJWT({ sub: merchantId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(merchantSessionSecret());

  const store = await cookies();
  store.set(MERCHANT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearMerchantSession(): Promise<void> {
  const store = await cookies();
  store.delete(MERCHANT_COOKIE);
}

/** The signed-in merchant's id, or null. Verification only — no DB hit. */
export async function getMerchantId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(MERCHANT_COOKIE)?.value;
  return token ? verifyMerchantToken(token) : null;
}

/**
 * The signed-in merchant, or null.
 *
 * Re-checks `verified` and `active` on every load rather than trusting the
 * cookie: un-verifying a merchant has to take their access away immediately,
 * not in ninety days when the token expires.
 */
export async function getCurrentMerchant(): Promise<Merchant | null> {
  const id = await getMerchantId();
  if (!id) return null;
  const merchant = await prisma.merchant.findUnique({ where: { id } });
  if (!merchant || !merchant.verified || !merchant.active) return null;
  return merchant;
}

export interface LockState {
  locked: boolean;
  minutesLeft: number;
}

export function lockState(merchant: Pick<Merchant, "pinLockedUntil">): LockState {
  if (!merchant.pinLockedUntil) return { locked: false, minutesLeft: 0 };
  const ms = merchant.pinLockedUntil.getTime() - Date.now();
  if (ms <= 0) return { locked: false, minutesLeft: 0 };
  return { locked: true, minutesLeft: Math.ceil(ms / 60000) };
}

export async function registerFailedAttempt(merchant: Merchant): Promise<LockState> {
  const attempts = merchant.pinAttempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60_000);
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { pinAttempts: 0, pinLockedUntil: until },
    });
    return { locked: true, minutesLeft: LOCK_MINUTES };
  }
  await prisma.merchant.update({ where: { id: merchant.id }, data: { pinAttempts: attempts } });
  return { locked: false, minutesLeft: 0 };
}

export async function registerSuccessfulLogin(merchantId: string): Promise<void> {
  await prisma.merchant.update({
    where: { id: merchantId },
    data: { pinAttempts: 0, pinLockedUntil: null, lastLoginAt: new Date() },
  });
}
