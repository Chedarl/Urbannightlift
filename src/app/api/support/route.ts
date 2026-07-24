import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { SupportCategory } from "@prisma/client";

const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  whatsappNumber: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().max(160).optional().or(z.literal("")),
  orderCode: z.string().trim().max(40).optional().or(z.literal("")),
  category: z.enum(["ORDER_ISSUE", "PAYMENT", "DELIVERY_AREA", "BECOME_RIDER", "PARTNERSHIP", "OTHER"]),
  message: z.string().trim().min(5).max(2000),
});

/** POST /api/support — public: store a Help Center request for the dispatcher. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }
  const d = parsed.data;
  const created = await prisma.supportRequest.create({
    data: {
      fullName: d.fullName,
      whatsappNumber: d.whatsappNumber || null,
      email: d.email || null,
      orderCode: d.orderCode || null,
      category: d.category as SupportCategory,
      message: d.message,
    },
  });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
