import { jwtVerify } from "jose";

/**
 * Edge-safe half of customer auth: the cookie name and token verification only.
 *
 * This module MUST stay importable from `src/middleware.ts`, which runs on the
 * Edge runtime. That means no `server-only`, no `next/headers`, no Prisma and no
 * bcryptjs — importing `customer.ts` from middleware pulled all four into the
 * Edge bundle (and Prisma is not Edge-compatible), which broke the production
 * build. Keep this file dependency-free apart from `jose`.
 */

export const CUSTOMER_COOKIE = "unl_customer";

export function customerSessionSecret(): Uint8Array {
  const secret =
    process.env.CUSTOMER_SESSION_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.DATABASE_URL ||
    "unl-dev-customer-session-secret";
  return new TextEncoder().encode(secret);
}

/** Returns the customer id from a session token, or null if it isn't valid. */
export async function verifyCustomerToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, customerSessionSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
