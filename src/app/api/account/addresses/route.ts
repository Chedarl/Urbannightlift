import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerId } from "@/lib/auth/customer";

/**
 * A customer's saved places. Only ever their own — every query is scoped by the
 * id inside the session cookie, never by an id sent from the browser.
 */

const MAX_ADDRESSES = 8;

export async function GET() {
  const customerId = await getCustomerId();
  if (!customerId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const addresses = await prisma.customerAddress.findMany({
    where: { customerId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ addresses });
}

export async function POST(req: NextRequest) {
  const customerId = await getCustomerId();
  if (!customerId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 40) : "";
  const locationText = typeof body.locationText === "string" ? body.locationText.trim().slice(0, 300) : "";

  if (label.length < 1) return NextResponse.json({ error: "Give it a name, like Home" }, { status: 400 });
  if (locationText.length < 3) return NextResponse.json({ error: "Pick the place first" }, { status: 400 });

  const count = await prisma.customerAddress.count({ where: { customerId } });
  if (count >= MAX_ADDRESSES) {
    return NextResponse.json(
      { error: `You can keep ${MAX_ADDRESSES} places. Remove one first.` },
      { status: 400 }
    );
  }

  // Saving the same place twice is a mis-tap, not a new address — update the
  // label instead of leaving two identical chips side by side.
  const existing = await prisma.customerAddress.findFirst({ where: { customerId, locationText } });
  if (existing) {
    const address = await prisma.customerAddress.update({
      where: { id: existing.id },
      data: { label },
    });
    return NextResponse.json({ address });
  }

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const address = await prisma.customerAddress.create({
    data: {
      customerId,
      label,
      locationText,
      landmark: typeof body.landmark === "string" ? body.landmark.slice(0, 300) || null : null,
      lat: num(body.lat),
      lng: num(body.lng),
      zoneId: typeof body.zoneId === "string" && body.zoneId ? body.zoneId : null,
    },
  });

  return NextResponse.json({ address }, { status: 201 });
}
