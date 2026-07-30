import "server-only";

import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * Web Push — the only free way to reach people when the app is closed.
 *
 * WhatsApp Cloud API went to per-message billing on 1 July 2025, so automated
 * WhatsApp alerts now cost money per delivery. Web Push costs nothing, works on
 * Android and desktop outright, and works on iOS 16.4+ once the app has been
 * added to the Home Screen — which the install prompt already guides people to.
 *
 * Everything here is best-effort. A notification is a courtesy; failing to send
 * one must never fail the order it was about.
 */

export interface PushMessage {
  title: string;
  body: string;
  /** Path to open when tapped, e.g. /admin/orders/xxx. */
  url: string;
  /** Collapses repeat alerts about the same thing instead of stacking them. */
  tag?: string;
}

let configured: boolean | null = null;

/** Push stays silently disabled until VAPID keys are set in the environment. */
function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:urbannightlift@gmail.com",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

interface Target {
  userIds?: string[];
  customerIds?: string[];
  roles?: string[];
}

/**
 * Sends to every device registered for the target. Subscriptions the browser
 * has abandoned (404/410) are pruned as we find them, which is the only
 * supported way to keep the table from filling with dead endpoints.
 */
export async function sendPush(target: Target, message: PushMessage): Promise<number> {
  if (!ensureConfigured()) return 0;

  const or: Record<string, unknown>[] = [];
  if (target.userIds?.length) or.push({ userId: { in: target.userIds } });
  if (target.customerIds?.length) or.push({ customerId: { in: target.customerIds } });
  if (target.roles?.length) {
    const staff = await prisma.user.findMany({
      where: { role: { in: target.roles as never }, status: "ACTIVE" },
      select: { id: true },
    });
    if (staff.length) or.push({ userId: { in: staff.map((s) => s.id) } });
  }
  if (or.length === 0) return 0;

  const subs = await prisma.pushSubscription.findMany({ where: { OR: or } });
  if (subs.length === 0) return 0;

  const payload = JSON.stringify(message);
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(sub.id);
      }
    })
  );

  if (dead.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } }).catch(() => {});
  }
  return sent;
}
