import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { User, UserRole } from "@prisma/client";

/**
 * Resolves the current staff user. Authorization source of truth is the
 * Postgres User row (role + status), re-fetched on every call so suspending
 * an account takes effect immediately.
 */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const user = await prisma.user.findUnique({ where: { authUserId: authUser.id } });
  if (!user || user.status !== "ACTIVE") return null;
  return user;
}

export const ADMIN_ROLES: UserRole[] = ["OWNER", "DISPATCHER", "SUPPORT"];

export async function requireRole(roles: UserRole[]): Promise<User | null> {
  const user = await getSessionUser();
  if (!user || !roles.includes(user.role)) return null;
  return user;
}
