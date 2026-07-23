import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

/** POST /api/users — Owner only: create a staff account (Supabase Auth + User row). */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "OWNER") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { fullName, email, phone, role, password } = body;
  if (!fullName || !email || !role || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["OWNER", "DISPATCHER", "RIDER", "SUPPORT"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    return NextResponse.json({ error: error?.message ?? "Auth create failed" }, { status: 400 });
  }

  const created = await prisma.user.create({
    data: { authUserId: data.user.id, fullName, email, phone: phone || null, role },
  });
  return NextResponse.json({ user: { id: created.id } }, { status: 201 });
}
