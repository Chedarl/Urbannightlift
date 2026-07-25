import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import {
  createCustomerSession,
  lockState,
  registerFailedAttempt,
  registerSuccessfulLogin,
  verifyPin,
} from "@/lib/auth/customer";

/** POST /api/account/login — WhatsApp number + PIN. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const whatsappNumber = normalizePhone(typeof body.whatsappNumber === "string" ? body.whatsappNumber : "");
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";

  if (!whatsappNumber || !pin) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({ where: { whatsappNumber } });

  // Same response whether the number is unknown or has no PIN, so the endpoint
  // can't be used to discover which numbers have accounts.
  if (!customer?.pinHash) {
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const locked = lockState(customer);
  if (locked.locked) {
    return NextResponse.json({ error: "locked", minutesLeft: locked.minutesLeft }, { status: 429 });
  }

  const ok = await verifyPin(pin, customer.pinHash);
  if (!ok) {
    const nowLocked = await registerFailedAttempt(customer);
    if (nowLocked.locked) {
      return NextResponse.json({ error: "locked", minutesLeft: nowLocked.minutesLeft }, { status: 429 });
    }
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  await registerSuccessfulLogin(customer.id);
  await createCustomerSession(customer.id);
  return NextResponse.json({ ok: true });
}
