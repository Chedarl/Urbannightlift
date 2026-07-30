import "server-only";

import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

/**
 * Letting a native app call the same API the website calls.
 *
 * Staff auth has always been Supabase cookies, which is right for a browser and
 * useless to a native app: a React Native rider app has no cookie jar to put a
 * session in. The alternative — a second set of endpoints for mobile — would
 * mean every rule about who may accept a job, record a receipt or move an order
 * existing in two places, and one of them eventually drifting.
 *
 * So the rider app signs in against Supabase directly, exactly as the website
 * does, and sends the access token it gets back as a normal
 * `Authorization: Bearer` header. This verifies that token and hands back the
 * auth user id; `getSessionUser()` then does the same Postgres lookup it always
 * did.
 *
 * **The security properties are unchanged**, and that is the point:
 *  - The token is verified by Supabase, not parsed by us.
 *  - The `User` row and its `status` are re-read on every call, so suspending an
 *    account still takes effect immediately rather than when a token expires.
 *  - Role checks are untouched — a rider's token gets a rider's permissions, and
 *    `ADMIN_ROLES` still gates everything it gated before.
 */

/**
 * The token out of an Authorization header, or null.
 *
 * Pure and separated from the network call so the parsing can be proven. A
 * malformed header is always "no token" rather than an error: the caller falls
 * through to the cookie path, and a browser sending something odd must still be
 * able to log in normally.
 */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  // Real Supabase access tokens are long JWTs. A short string is a mistake or a
  // probe, and is not worth a round trip to Supabase to find out.
  if (token.length < 20 || token.includes(" ")) return null;
  return token;
}

/** Reads and verifies a bearer token, if the request carries one. */
export async function bearerAuthUserId(): Promise<string | null> {
  const token = bearerToken((await headers()).get("authorization"));
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  try {
    // A fresh client per call, with no session persistence: this must verify the
    // token it was handed and nothing else. Reusing a stateful client risks it
    // answering from a session belonging to a different request.
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
