import "server-only";

import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  AMBASSADOR_COOKIE,
  ambassadorSessionSecret,
  verifyAmbassadorToken,
} from "@/lib/auth/ambassadorToken";
import type { Ambassador } from "@prisma/client";

export { AMBASSADOR_COOKIE, verifyAmbassadorToken };

/**
 * Ambassador logins — a third, separate identity from staff and customers.
 *
 * An ambassador is not staff. Giving them a `User` row would hand somebody
 * recruited off Instagram access to customer addresses, phone numbers and the
 * dispatch console, which is not remotely what "let me see my earnings" needs.
 * So this mirrors the customer PIN path instead: their code plus a short PIN,
 * an HttpOnly cookie, and nothing else.
 *
 * SECURITY: this PIN is an Urban Night Lift login PIN only. The app must never
 * ask for or store a MoMo/Orange Money PIN, OTP, or bank password. An
 * ambassador's payout number is a plain phone number, never a secret code.
 */

const SESSION_DAYS = 60;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export const PIN_MIN = 4;
export const PIN_MAX = 6;

/** Returns a human explanation of why a PIN is unusable, or null when it is fine. */
export function pinProblem(pin: string): string | null {
  if (!new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin)) {
    return `Choose a PIN of ${PIN_MIN} to ${PIN_MAX} digits.`;
  }
  // A code everyone tries first protects nobody, and this PIN guards money.
  if (/^(\d)\1+$/.test(pin)) return "Please don't use the same digit repeated.";
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) {
    return "Please don't use digits in a row.";
  }
  return null;
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

export async function createAmbassadorSession(ambassadorId: string): Promise<void> {
  const token = await new SignJWT({ sub: ambassadorId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(ambassadorSessionSecret());

  const store = await cookies();
  store.set(AMBASSADOR_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearAmbassadorSession(): Promise<void> {
  const store = await cookies();
  store.delete(AMBASSADOR_COOKIE);
}

/** The signed-in ambassador's id, or null. Verification only — no DB hit. */
export async function getAmbassadorId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(AMBASSADOR_COOKIE)?.value;
  return token ? verifyAmbassadorToken(token) : null;
}

/**
 * The signed-in ambassador, but only while they are still ACTIVE.
 *
 * A suspended ambassador holding a valid 60-day cookie must lose access the
 * moment they are suspended, not whenever their cookie happens to expire.
 */
export async function getCurrentAmbassador(): Promise<Ambassador | null> {
  const id = await getAmbassadorId();

  // Applying now starts with an ordinary Urban Night Lift account, so that
  // account is the login — nobody needs a second PIN for a second door. The
  // legacy cookie above still works for anyone who signed up before that,
  // which is why both paths exist rather than one.
  const ambassador = id
    ? await prisma.ambassador.findUnique({ where: { id } })
    : await ambassadorForCurrentCustomer();

  if (!ambassador || ambassador.status === "SUSPENDED") return null;
  return ambassador;
}

async function ambassadorForCurrentCustomer(): Promise<Ambassador | null> {
  const { getCustomerId } = await import("@/lib/auth/customer");
  const customerId = await getCustomerId();
  if (!customerId) return null;
  return prisma.ambassador.findFirst({ where: { customerId } });
}

export interface LockState {
  locked: boolean;
  minutesLeft: number;
}

export function lockState(a: Pick<Ambassador, "pinLockedUntil">): LockState {
  if (!a.pinLockedUntil) return { locked: false, minutesLeft: 0 };
  const ms = a.pinLockedUntil.getTime() - Date.now();
  if (ms <= 0) return { locked: false, minutesLeft: 0 };
  return { locked: true, minutesLeft: Math.ceil(ms / 60000) };
}

/** Records a failed PIN attempt and locks the account once the limit is hit. */
export async function registerFailedAttempt(a: Ambassador): Promise<LockState> {
  const attempts = a.pinAttempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await prisma.ambassador.update({
      where: { id: a.id },
      data: { pinAttempts: 0, pinLockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
    });
    return { locked: true, minutesLeft: LOCK_MINUTES };
  }
  await prisma.ambassador.update({ where: { id: a.id }, data: { pinAttempts: attempts } });
  return { locked: false, minutesLeft: 0 };
}

export async function registerSuccessfulLogin(ambassadorId: string): Promise<void> {
  await prisma.ambassador.update({
    where: { id: ambassadorId },
    data: { pinAttempts: 0, pinLockedUntil: null, lastLoginAt: new Date() },
  });
}
