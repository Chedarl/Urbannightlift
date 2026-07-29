import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerId } from "@/lib/auth/customer";

/**
 * DELETE /api/account/addresses/[id] — forget a saved place.
 *
 * The delete is scoped by customerId as well as address id, so a guessed id
 * removes nothing rather than someone else's address.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ addressId: string }> }) {
  const customerId = await getCustomerId();
  if (!customerId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const { addressId } = await params;
  const { count } = await prisma.customerAddress.deleteMany({ where: { id: addressId, customerId } });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
