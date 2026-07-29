import { jwtVerify } from "jose";

/**
 * Edge-safe half of ambassador auth: the cookie name and token verification.
 *
 * Same rule as `customerToken.ts` — this must stay importable from
 * `src/middleware.ts`, which runs on the Edge runtime, so no `server-only`, no
 * `next/headers`, no Prisma and no bcryptjs. Keep it to `jose`.
 */

export const AMBASSADOR_COOKIE = "unl_ambassador";

export function ambassadorSessionSecret(): Uint8Array {
  const secret =
    process.env.AMBASSADOR_SESSION_SECRET ||
    process.env.CUSTOMER_SESSION_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.DATABASE_URL ||
    "unl-dev-ambassador-session-secret";
  return new TextEncoder().encode(secret);
}

/** Returns the ambassador id from a session token, or null if it isn't valid. */
export async function verifyAmbassadorToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, ambassadorSessionSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
