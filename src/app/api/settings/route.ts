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

/** PATCH /api/settings — staff: update operating mode / hours / notices. */
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

  await getOperatingSettings(); // ensure the singleton exists
  const settings = await prisma.operatingSettings.update({ where: { id: 1 }, data });
  return NextResponse.json({ settings });
}
