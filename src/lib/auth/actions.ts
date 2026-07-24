"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export interface SignInResult {
  error?: "invalid" | "suspended";
}

/**
 * Signs a staff member in and redirects them to the dashboard matching their
 * DB role (rider vs admin). Authorization always comes from the Postgres User
 * row, never from Supabase metadata alone.
 */
export async function signInAction(_prev: SignInResult, formData: FormData): Promise<SignInResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").trim();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "invalid" };

  const user = await prisma.user.findUnique({ where: { authUserId: data.user.id } });
  if (!user) {
    await supabase.auth.signOut();
    return { error: "invalid" };
  }
  if (user.status !== "ACTIVE") {
    await supabase.auth.signOut();
    return { error: "suspended" };
  }

  redirect(user.role === "RIDER" ? "/rider/dashboard" : "/admin/dashboard");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
