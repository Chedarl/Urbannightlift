import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

/**
 * Proof that the visitor actually owns an order.
 *
 * An order code alone must NOT unlock private order data — the delivery OTP in
 * particular is the secret a rider checks at handover, and order codes travel
 * through WhatsApp, PDFs and screenshots. We therefore keep a small signed list
 * of order codes the visitor has proven ownership of:
 *
 *  - set when they place the order (they are the one who submitted it), and
 *  - set when they pass the code + WhatsApp-number check in /api/orders/track.
 *
 * The cookie is HMAC-signed so it can't be forged client-side. It holds order
 * codes only — no personal data.
 */

const COOKIE_NAME = "unl_order_access";
const MAX_CODES = 25;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 days

function secret(): string {
  return (
    process.env.ORDER_ACCESS_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.DATABASE_URL ||
    "unl-dev-order-access-secret"
  );
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function encode(codes: string[]): string {
  const payload = Buffer.from(JSON.stringify(codes.slice(-MAX_CODES))).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(value: string | undefined): string[] {
  if (!value) return [];
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return [];
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!safeEqual(sign(payload), signature)) return [];
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

export const ORDER_ACCESS_COOKIE = COOKIE_NAME;

/** Cookie attributes shared by every write. */
export function orderAccessCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

/**
 * Builds the cookie value granting access to `orderCode`, preserving any codes
 * the visitor already proved. `existing` is the current raw cookie value.
 */
export function grantOrderAccessValue(existing: string | undefined, orderCode: string): string {
  const code = orderCode.toUpperCase();
  const codes = decode(existing).filter((c) => c !== code);
  codes.push(code);
  return encode(codes);
}

/** Reads proven order codes in a server component / route handler. */
export async function provenOrderCodes(): Promise<string[]> {
  const store = await cookies();
  return decode(store.get(COOKIE_NAME)?.value);
}

/** True when the visitor has proven ownership of this order. */
export async function hasOrderAccess(orderCode: string): Promise<boolean> {
  const codes = await provenOrderCodes();
  return codes.includes(orderCode.toUpperCase());
}
