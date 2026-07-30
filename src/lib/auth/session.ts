import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bearerAuthUserId } from "@/lib/auth/bearer";
import { prisma } from "@/lib/prisma";
import type { User, UserRole } from "@prisma/client";

/**
 * Resolves the current staff user. Authorization source of truth is the
 * Postgres User row (role + status), re-fetched on every call so suspending
 * an account takes effect immediately.
 *
 * Two ways in, one set of rules. A browser presents Supabase cookies; a native
 * app presents the same Supabase session as an `Authorization: Bearer` header,
 * because a React Native app has no cookie jar. Whichever arrives, the identity
 * is verified by Supabase and then resolved against the same `User` row with the
 * same status check — so the rider app gets exactly a rider's permissions and
 * every existing endpoint works from mobile without being duplicated.
 */
export async function getSessionUser(): Promise<User | null> {
  // Header first: a native app never sends cookies, and checking it first also
  // means a stale browser cookie can't shadow an explicit token.
  let authUserId = await bearerAuthUserId();

  if (!authUserId) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    authUserId = authUser?.id ?? null;
  }
  if (!authUserId) return null;

  const user = await prisma.user.findUnique({ where: { authUserId } });
  if (!user || user.status !== "ACTIVE") return null;
  return user;
}

export const ADMIN_ROLES: UserRole[] = ["OWNER", "DISPATCHER", "SUPPORT"];

export async function requireRole(roles: UserRole[]): Promise<User | null> {
  const user = await getSessionUser();
  if (!user || !roles.includes(user.role)) return null;
  return user;
}
