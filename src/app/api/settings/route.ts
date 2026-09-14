import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { configuredPaymentMethods } from "@/lib/payments/methods";
import { getOperatingSettings, resolveEnabledServices } from "@/lib/settings";
import { recordAudit, diffFields } from "@/lib/audit";
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

/** GET /api/settings — public: drives the customer closed/paused banner. */
export async function GET() {
  const settings = await getOperatingSettings();
  return NextResponse.json(
    {
      mode: settings.mode,
      operatingStartHour: settings.operatingStartHour,
      operatingEndHour: settings.operatingEndHour,
      zoneNoticeEn: settings.zoneNoticeEn,
      zoneNoticeFr: settings.zoneNoticeFr,
      enabledServices: resolveEnabledServices(settings),
      testMode: settings.testMode,
      // Public so the order forms know whether to offer the microphone at all.
      voiceOrderingEnabled: settings.voiceOrderingEnabled,
      /*
        Which ways of paying actually work. Public for the same reason as the
        service list: the forms hardcoded all three methods, production has no
        Orange merchant code, and a customer who picked Orange Money reached a
        payment screen that rendered nothing at all.

        Only the *availability* is exposed, never the merchant codes — those go
        to the one customer with an order to pay, on the confirmation page, and
        have no business in a public settings response.
      */
      paymentMethods: configuredPaymentMethods(settings),
    },
    {
      // These are live operational switches — whether we are open, which
      // services are orderable, whether the microphone appears. A cached copy
      // means the owner flips something in Settings and customers keep seeing
      // the old answer, which is indistinguishable from the toggle being broken.
      headers: { "Cache-Control": "no-store, must-revalidate" },
    }
  );
}

/**
 * PATCH /api/settings — staff: update operating mode / hours / notices.
 *
 * The merchant codes and USSD templates decide where customer money is sent, so
 * only the OWNER may change them; dispatchers and support keep day-to-day
 * control of the operating mode, hours and notices.
 */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role === "RIDER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = { updatedByUserId: user.id };

  if (["OPEN", "PAUSED", "CLOSED"].includes(body.mode)) data.mode = body.mode;
  if (typeof body.operatingStartHour === "number") data.operatingStartHour = body.operatingStartHour;
  if (typeof body.operatingEndHour === "number") data.operatingEndHour = body.operatingEndHour;
  if (typeof body.zoneNoticeEn === "string") data.zoneNoticeEn = body.zoneNoticeEn;
  if (typeof body.zoneNoticeFr === "string") data.zoneNoticeFr = body.zoneNoticeFr;

  // Which services are offered is a business decision, so OWNER-only like the
  // payment codes. Unknown values are dropped rather than stored.
  if (Array.isArray(body.enabledServices)) {
    if (user.role !== "OWNER") {
      return NextResponse.json({ error: "Only the owner can change which services are offered" }, { status: 403 });
    }
    data.enabledServices = (body.enabledServices as unknown[]).filter(
      (s): s is ServiceType => typeof s === "string" && ALL_SERVICES.includes(s as ServiceType)
    );
  }

  const paymentFields = ["mtnMerchantCode", "mtnUssdTemplate", "orangeMerchantCode", "orangeUssdTemplate"];
  const touchesPayment = paymentFields.some((f) => typeof body[f] === "string");
  if (touchesPayment) {
    if (user.role !== "OWNER") {
      return NextResponse.json({ error: "Only the owner can change payment codes" }, { status: 403 });
    }
    if (typeof body.mtnMerchantCode === "string") data.mtnMerchantCode = body.mtnMerchantCode || null;
    if (typeof body.mtnUssdTemplate === "string") data.mtnUssdTemplate = body.mtnUssdTemplate || null;
    if (typeof body.orangeMerchantCode === "string") data.orangeMerchantCode = body.orangeMerchantCode || null;
    if (typeof body.orangeUssdTemplate === "string") data.orangeUssdTemplate = body.orangeUssdTemplate || null;
  }

  // Test mode decides whether orders count as real trading, so it is
  // OWNER-only like everything else that moves the numbers.
  if (typeof body.testMode === "boolean") {
    if (user.role !== "OWNER") {
      return NextResponse.json({ error: "Only the owner can change test mode" }, { status: 403 });
    }
    data.testMode = body.testMode;
  }

  // Where operational email goes decides who receives customer names, numbers
  // and addresses, so it is the owner's call — not a dispatcher's.
  if (typeof body.notificationEmail === "string") {
    if (user.role !== "OWNER") {
      return NextResponse.json({ error: "Only the owner can change the notification email" }, { status: 403 });
    }
    const addr = body.notificationEmail.trim();
    if (addr && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) {
      return NextResponse.json({ error: "That doesn't look like an email address" }, { status: 400 });
    }
    data.notificationEmail = addr || null;
  }
  if (typeof body.emailOnEveryOrder === "boolean") data.emailOnEveryOrder = body.emailOnEveryOrder;
  if (typeof body.dailySummaryEmail === "boolean") data.dailySummaryEmail = body.dailySummaryEmail;

  // Proving domain ownership to Google is squarely an owner's business.
  if (typeof body.googleSiteVerification === "string") {
    if (user.role !== "OWNER") {
      return NextResponse.json({ error: "Only the owner can change the Google verification token" }, { status: 403 });
    }
    // People paste the whole <meta> tag. Take the token out of it rather than
    // failing and making them work out what went wrong.
    const raw = body.googleSiteVerification.trim();
    const fromTag = raw.match(/content=["']([^"']+)["']/)?.[1];
    const fromPair = raw.match(/google-site-verification[=:]\s*([\w-]+)/)?.[1];
    data.googleSiteVerification = (fromTag ?? fromPair ?? raw).trim() || null;
  }

  // Voice ordering is built and tested but stays off until the owner decides
  // the market wants it. Turning it on changes what customers are offered, so
  // it is the owner's call, not a dispatcher's.
  if (typeof body.voiceOrderingEnabled === "boolean") {
    if (user.role !== "OWNER") {
      return NextResponse.json({ error: "Only the owner can turn voice ordering on" }, { status: 403 });
    }
    data.voiceOrderingEnabled = body.voiceOrderingEnabled;
  }

  // Whether ordering requires an account. On by default; lifting it opens a
  // guest path, which is a business decision, so it is the owner's alone.
  if (typeof body.requireAccountToOrder === "boolean") {
    if (user.role !== "OWNER") {
      return NextResponse.json({ error: "Only the owner can change account-first ordering" }, { status: 403 });
    }
    data.requireAccountToOrder = body.requireAccountToOrder;
  }

  // The revenue share decides how every franc is divided, so it is OWNER-only
  // and audited. It applies to future deliveries only — completed orders keep
  // the rate they were delivered under.
  if (body.riderSharePercent !== undefined) {
    if (user.role !== "OWNER") {
      return NextResponse.json({ error: "Only the owner can change the revenue share" }, { status: 403 });
    }
    const pct = Number(body.riderSharePercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return NextResponse.json({ error: "The rider share must be between 0 and 100" }, { status: 400 });
    }
    data.riderSharePercent = Math.round(pct);
  }

  const before = await getOperatingSettings(); // ensure the singleton exists
  const settings = await prisma.operatingSettings.update({ where: { id: 1 }, data });

  const changes = diffFields(before as unknown as Record<string, unknown>, data);
  delete changes.updatedByUserId; // always changes; says nothing
  if (Object.keys(changes).length > 0) {
    await recordAudit({
      actor: user,
      action: "settings.updated",
      entityType: "settings",
      entityId: "1",
      entityLabel: "Operating settings",
      changes,
    });
  }

  return NextResponse.json({ settings });
}
