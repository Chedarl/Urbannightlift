import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";

const FIELDS = [
  "merchantName",
  "category",
  "whatsappNumber",
  "phone",
  "address",
  "landmark",
  "openingHours",
  "notes",
  "verified",
  "active",
];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const k of FIELDS) if (k in body) data[k] = body[k];
  const merchant = await prisma.merchant.update({ where: { id: merchantId }, data });
  return NextResponse.json({ merchant });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await prisma.merchant.update({ where: { id: merchantId }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
