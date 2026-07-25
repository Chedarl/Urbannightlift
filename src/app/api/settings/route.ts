import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getOperatingSettings } from "@/lib/settings";

/** GET /api/settings — public: drives the customer closed/paused banner. */
export async function GET() {
  const settings = await getOperatingSettings();
  return NextResponse.json({
    mode: settings.mode,
    operatingStartHour: settings.operatingStartHour,
    operatingEndHour: settings.operatingEndHour,
    zoneNoticeEn: settings.zoneNoticeEn,
    zoneNoticeFr: settings.zoneNoticeFr,
  });
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

  await getOperatingSettings(); // ensure the singleton exists
  const settings = await prisma.operatingSettings.update({ where: { id: 1 }, data });
  return NextResponse.json({ settings });
}
