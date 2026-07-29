import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/utils";
import { notifyRiderApplication } from "@/lib/notify/triggers";

/**
 * Somebody asking to ride for us.
 *
 * The single most important property of this route: it creates a
 * `RiderApplication`, never a `User`. A `User` row carries a staff login and
 * access to customer addresses and phone numbers, and nobody should hold that
 * because they filled in a public form. Approving an application — a deliberate
 * act by a human who has looked at the ID — is what creates the account.
 *
 * Uploaded ID images land in a private bucket and are read back only through
 * the ADMIN_ROLES-gated media route. They are never shown to a customer.
 */

/** One application per number per day. A rider fixing a typo, not a flood. */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const VEHICLES = ["MOTORCYCLE", "SCOOTER", "BICYCLE", "CAR"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // A field no human sees and no real application fills.
  if (typeof body.companyWebsite === "string" && body.companyWebsite.trim()) {
    return NextResponse.json({ ok: true });
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const whatsappNumber = normalizePhone(typeof body.whatsappNumber === "string" ? body.whatsappNumber : "");
  const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "") || whatsappNumber;

  if (fullName.length < 3) {
    return NextResponse.json({ error: "Please give your full name as it appears on your ID." }, { status: 400 });
  }
  if (whatsappNumber.length < 11) {
    return NextResponse.json({ error: "A WhatsApp number is needed — it is how we reach you." }, { status: 400 });
  }
  if (body.acceptedTerms !== true) {
    return NextResponse.json({ error: "Please confirm the details you gave are true." }, { status: 400 });
  }

  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

  // A repeat submission updates the pending row rather than making a twin —
  // two half-filled applications for one person is worse than one complete.
  const existing = await prisma.riderApplication.findFirst({
    where: { whatsappNumber, status: "PENDING" },
    select: { id: true, updatedAt: true },
  });
  if (existing && existing.updatedAt.getTime() > Date.now() - COOLDOWN_MS) {
    return NextResponse.json({
      ok: true,
      alreadyReceived: true,
      message: "We already have your application — we'll call you.",
    });
  }

  const data = {
    fullName,
    phone,
    whatsappNumber,
    email: str(body.email, 120),
    neighbourhood: str(body.neighbourhood, 120),
    zonePreference: Array.isArray(body.zonePreference)
      ? (body.zonePreference as unknown[]).filter((z): z is string => typeof z === "string").slice(0, 10)
      : [],
    idCardNumber: str(body.idCardNumber, 60),
    idCardFrontUrl: str(body.idCardFrontUrl, 500),
    idCardBackUrl: str(body.idCardBackUrl, 500),
    photoUrl: str(body.photoUrl, 500),
    vehicleType: VEHICLES.find((v) => v === body.vehicleType) ?? null,
    vehicleRef: str(body.vehicleRef, 120),
    hasLicence: body.hasLicence === true,
    ownsVehicle: body.ownsVehicle !== false,
    availability: str(body.availability, 300),
    yearsExperience:
      Number.isFinite(Number(body.yearsExperience)) && Number(body.yearsExperience) >= 0
        ? Math.min(50, Math.round(Number(body.yearsExperience)))
        : null,
    knowsCity: str(body.knowsCity, 500),
    notes: str(body.notes, 500),
  };

  const application = existing
    ? await prisma.riderApplication.update({ where: { id: existing.id }, data })
    : await prisma.riderApplication.create({ data });

  // A rider applying at 2 AM is worth knowing about at 2 AM. Never let a
  // failed notification lose the application itself.
  await notifyRiderApplication(application.id, application.fullName).catch(() => {});

  return NextResponse.json({ ok: true, id: application.id }, { status: 201 });
}

/** GET — staff only: the queue of people waiting to hear back. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status");
  const applications = await prisma.riderApplication.findMany({
    where: status === "PENDING" || status === "APPROVED" || status === "REJECTED" ? { status } : undefined,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({ applications });
}
