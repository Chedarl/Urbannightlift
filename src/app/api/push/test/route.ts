import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { sendPush, pushPublicKey } from "@/lib/notify/push";

/**
 * POST /api/push/test — send a notification to the caller's own devices.
 *
 * Notifications are the one feature you cannot verify by looking at the app:
 * a silent failure looks exactly like "no orders came in". This proves the
 * whole chain — VAPID keys, subscription, service worker, the push service —
 * in one tap, and says precisely which link is broken when it isn't working.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  if (!pushPublicKey()) {
    return NextResponse.json(
      {
        error:
          "Push is switched off: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not set in this environment.",
        code: "NO_VAPID",
      },
      { status: 503 }
    );
  }

  const devices = await prisma.pushSubscription.count({ where: { userId: user.id } });
  if (devices === 0) {
    return NextResponse.json(
      {
        error:
          "No device is registered for you yet. Tap 'Turn on alerts' on this device and allow notifications, then try again.",
        code: "NO_DEVICE",
      },
      { status: 409 }
    );
  }

  const sent = await sendPush(
    { userIds: [user.id] },
    {
      title: "Urban Night Lift — test alert",
      body: `Notifications are working. Sent to ${devices} device${devices === 1 ? "" : "s"}.`,
      url: "/admin/dashboard",
      tag: "push-test",
    }
  );

  if (sent === 0) {
    return NextResponse.json(
      {
        error:
          "Your device is registered but the push service rejected the message. The usual cause is that the VAPID keys were changed after this device subscribed — turn alerts off and on again to re-register.",
        code: "SEND_FAILED",
        devices,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, sent, devices });
}
