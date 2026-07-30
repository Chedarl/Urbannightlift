import { jwtVerify } from "jose";

/**
 * Edge-safe half of merchant auth: the cookie name and token verification only.
 *
 * Kept separate for exactly the reason `customerToken.ts` is: `src/middleware.ts`
 * runs on the Edge runtime, and importing the full auth module there would pull
 * in Prisma and bcryptjs — neither of which is Edge-compatible. Keep this file
 * dependency-free apart from `jose`.
 */

export const MERCHANT_COOKIE = "unl_merchant";

export function merchantSessionSecret(): Uint8Array {
  // A distinct salt from the customer secret, so a customer token can never be
  // replayed as a merchant token even if the underlying env var is shared.
  const secret =
    process.env.MERCHANT_SESSION_SECRET ||
    `merchant:${process.env.CUSTOMER_SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.DATABASE_URL || "unl-dev-secret"}`;
  return new TextEncoder().encode(secret);
}

/** Returns the merchant id from a session token, or null if it isn't valid. */
export async function verifyMerchantToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, merchantSessionSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
