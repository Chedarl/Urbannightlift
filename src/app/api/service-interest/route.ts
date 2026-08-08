import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, limitMessage, trippedHoneypot } from "@/lib/security/rateLimit";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { getOperatingSettings, isServiceEnabled } from "@/lib/settings";
import type { ServiceType } from "@prisma/client";

const ALL_SERVICES: ServiceType[] = [
  "FOOD_PICKUP",
  "MEDICINE_PICKUP",
  "GROCERY_PICKUP",
  "SMALL_PARCEL",
  "URGENT_ITEM",
  "CUSTOM_ERRAND",
  "MERCHANT_DELIVERY",
];

/**
 * POST /api/service-interest — public. A customer asks to be told when a paused
 * service launches. This is the waiting list the owner uses to judge demand
 * before switching a service on.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // A field no person sees. A script fills every input it finds, so this is
  // accepted and quietly discarded — telling it that it was caught only
  // teaches it to leave the field alone next time.
  if (trippedHoneypot(body as Record<string, unknown>)) return NextResponse.json({ ok: true });

  const limit = await checkRateLimit(req, "interest");
  if (!limit.ok) {
    return NextResponse.json(
      { error: limitMessage(limit, body.locale === "FR" || body.locale === "fr") },
      { status: 429, headers: { "Retry-After": String(limit.retryInMinutes * 60) } }
    );
  }

  const serviceType = body.serviceType as ServiceType;
  if (!ALL_SERVICES.includes(serviceType)) {
    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  }

  const whatsappNumber = normalizePhone(typeof body.whatsappNumber === "string" ? body.whatsappNumber : "");
  if (whatsappNumber.length < 8) {
    return NextResponse.json({ error: "A valid WhatsApp number is required" }, { status: 400 });
  }

  // Nothing to join if the service is already live — tell the client to proceed.
  const settings = await getOperatingSettings();
  if (isServiceEnabled(settings, serviceType)) {
    return NextResponse.json({ alreadyLive: true });
  }

  const locale = body.locale === "fr" ? "fr" : "en";

  // Re-registering the same number is a no-op rather than an error.
  await prisma.serviceInterest.upsert({
    where: { serviceType_whatsappNumber: { serviceType, whatsappNumber } },
    update: { locale },
    create: { serviceType, whatsappNumber, locale },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
