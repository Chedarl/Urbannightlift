import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getOperatingSettings } from "@/lib/settings";
import { tonightWindow } from "@/lib/orders/tonight";
import { riderStanding } from "@/lib/riders/standing";
import { loadRiderFloat } from "@/lib/riders/floatAccount";

export const dynamic = "force-dynamic";

/**
 * GET /api/rider/me — everything the rider app needs on launch, in one call.
 *
 * The web dashboard is a server component that reads Prisma directly, which a
 * native app cannot do. Rather than have the app make five requests over a
 * Yaoundé mobile connection at 8 PM, this assembles the same picture the
 * dashboard renders and returns it once.
 *
 * It shares `riderStanding` and `loadRiderFloat` with the web screens on
 * purpose: a rider must never be told they have 5,000 left to spend on their
 * phone while the site says 15,000.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "RIDER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getOperatingSettings();
  const { start, end } = tonightWindow(settings.operatingStartHour);

  const [tonight, history, float] = await Promise.all([
    prisma.order.findMany({
      where: {
        assignedRiderId: user.id,
        createdAt: { gte: start, lt: end },
        archivedAt: null,
        ...(settings.testMode ? {} : { isTest: false }),
      },
      select: { riderPayoutXaf: true, orderStatus: true },
    }),
    prisma.order.findMany({
      where: { assignedRiderId: user.id },
      select: { orderStatus: true, riderPayoutXaf: true, ratingStars: true, isTest: true },
    }),
    loadRiderFloat(user.id),
  ]);

  const standing = riderStanding(
    history.map((o) => ({
      completed: o.orderStatus === "DELIVERED" || o.orderStatus === "CLOSED",
      riderPayoutXaf: o.riderPayoutXaf,
      ratingStars: o.ratingStars,
      isTest: o.isTest,
    }))
  );

  return NextResponse.json({
    rider: {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      photoUrl: user.photoUrl,
      vehicleRef: user.vehicleRef,
      isOnline: user.isOnline,
      idVerified: user.idVerifiedAt != null,
    },
    tonight: {
      jobs: tonight.length,
      earnedXaf: tonight.reduce((sum, o) => sum + (o.riderPayoutXaf ?? 0), 0),
      // So the app can show the operating window without hardcoding 18/4.
      opensHour: settings.operatingStartHour,
      closesHour: settings.operatingEndHour,
      serviceOpen: settings.mode === "OPEN",
    },
    standing,
    float: {
      limitXaf: float?.limitXaf ?? 0,
      balanceXaf: float?.balanceXaf ?? 0,
      advancedXaf: float?.advancedXaf ?? 0,
      spendableXaf: float?.spendableXaf ?? 0,
      suspended: float?.suspended ?? false,
    },
  });
}
