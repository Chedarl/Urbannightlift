import "server-only";

import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_COOKIE, customerSessionSecret, verifyCustomerToken } from "@/lib/auth/customerToken";
import type { Customer } from "@prisma/client";

// Re-exported so existing server-side callers keep one import site. Middleware
// must import these from customerToken.ts directly — this module is not
// Edge-safe (bcryptjs, next/headers, Prisma).
export { CUSTOMER_COOKIE, verifyCustomerToken };

/**
 * Customer accounts, deliberately separate from the staff Supabase auth path.
 *
 * Customers sign in with the WhatsApp number they already order with plus a
 * short PIN — no SMS/OTP, which would cost per message in Cameroon. Because a
 * phone number is public, the PIN is protected by an attempt lockout.
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

/** Issues the session cookie. Called from route handlers after signup/login. */
export async function createCustomerSession(customerId: string): Promise<void> {
  const token = await new SignJWT({ sub: customerId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(customerSessionSecret());

  const store = await cookies();
  store.set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearCustomerSession(): Promise<void> {
  const store = await cookies();
  store.delete(CUSTOMER_COOKIE);
}

/** Returns the signed-in customer's id, or null. Verification only — no DB hit. */
export async function getCustomerId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;
  return token ? verifyCustomerToken(token) : null;
}

export async function getCurrentCustomer(): Promise<Customer | null> {
  const id = await getCustomerId();
  if (!id) return null;
  return prisma.customer.findUnique({ where: { id } });
}

export interface LockState {
  locked: boolean;
  minutesLeft: number;
}

export function lockState(customer: Pick<Customer, "pinLockedUntil">): LockState {
  if (!customer.pinLockedUntil) return { locked: false, minutesLeft: 0 };
  const ms = customer.pinLockedUntil.getTime() - Date.now();
  if (ms <= 0) return { locked: false, minutesLeft: 0 };
  return { locked: true, minutesLeft: Math.ceil(ms / 60000) };
}

/** Records a failed PIN attempt and locks the account once the limit is hit. */
export async function registerFailedAttempt(customer: Customer): Promise<LockState> {
  const attempts = customer.pinAttempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60_000);
    await prisma.customer.update({
      where: { id: customer.id },
      data: { pinAttempts: 0, pinLockedUntil: until },
    });
    return { locked: true, minutesLeft: LOCK_MINUTES };
  }
  await prisma.customer.update({ where: { id: customer.id }, data: { pinAttempts: attempts } });
  return { locked: false, minutesLeft: 0 };
}

export async function registerSuccessfulLogin(customerId: string): Promise<void> {
  await prisma.customer.update({
    where: { id: customerId },
    data: { pinAttempts: 0, pinLockedUntil: null, lastLoginAt: new Date() },
  });
}
