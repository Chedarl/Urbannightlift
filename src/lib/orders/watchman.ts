import "server-only";

import { prisma } from "@/lib/prisma";
import { concernOf, isLive, type Concern } from "@/lib/orders/liveWatch";
import { sendPush } from "@/lib/notify/push";

/**
 * The thing that notices, when nobody is looking at the screen.
 *
 * ## The gap
 *
 * `concernOf` already knows what a stalled order looks like — unpriced for
 * twelve minutes, unpaid for twenty-five, out with a rider whose phone stopped
 * reporting an hour ago — and `/api/admin/live` renders it beautifully. But it
 * only runs **when a human has the console open**. On a night where the console
 * is not being watched, an order can sit unpriced from 11 PM until somebody
 * opens a laptop, and the first person to notice is the customer.
 *
 * That is the difference between a system that detects a problem and one that
 * *raises* it, and it is most of what "the app is not functioning as it should"
 * turns out to mean in practice.
 *
 * ## The design, and the one thing it must not do
 *
 * It must not become noise. A watchman that pushes the same alert every ten
 * minutes trains dispatch to swipe the notifications away, at which point it is
 * worse than nothing — the real alarm arrives into a habit of ignoring alarms.
 *
 * So: **only URGENT**, and **only once per order per hour**, judged from
 * `NotificationLog`, which is already written on every send and already indexed
 * by entity. No new table, no new column, and the record of what was raised
 * lives in the same place as every other message this product sends.
 *
 * It never changes an order. It looks, and it tells a person.
 */

/** How long before the same order may raise its hand again. */
export const REALERT_MS = 60 * 60_000;

const EVENT = "order.stalled";

export interface WatchResult {
  /** Live orders examined. */
  looked: number;
  /** Orders currently in an urgent state. */
  urgent: number;
  /** Alerts actually sent, after the once-an-hour rule. */
  raised: { orderCode: string; message: string; action: string }[];
}

export async function runWatchman(now = new Date()): Promise<WatchResult> {
  const settings = await prisma.operatingSettings.findUnique({
    where: { id: 1 },
    select: { testMode: true },
  });

  const orders = await prisma.order.findMany({
    where: {
      // A night's worth. Anything older than this that is still open is a
      // different problem and one a nightly summary already reports.
      createdAt: { gte: new Date(now.getTime() - 24 * 3_600_000) },
      // Rehearsal orders must never wake anybody up.
      ...(settings?.testMode ? {} : { isTest: false }),
    },
    select: {
      id: true,
      orderCode: true,
      orderStatus: true,
      createdAt: true,
      quoteSentAt: true,
      quoteAcceptedAt: true,
      paymentStatus: true,
      paymentMethod: true,
      assignedRiderId: true,
      riderAcceptedAt: true,
      assignedAt: true,
      riderLocationAt: true,
      riderLat: true,
      riderLng: true,
      customerConfirmedAt: true,
    },
  });

  /*
   * Stamp the round, before anything can go wrong with it.
   *
   * Recorded on every round — alert or not — because the fact worth surfacing
   * is the *silence*. This workflow failed 374 times over a month with its only
   * symptom a GitHub inbox nobody read; `/admin/settings` now shows when the
   * watchman last ran, so "it has never run" is visible where somebody looks.
   *
   * Swallowed on failure: a tidy-up timestamp must never stop the round that
   * matters.
   */
  await prisma.operatingSettings
    .update({ where: { id: 1 }, data: { watchmanRanAt: now } })
    .catch(() => {});

  const live = orders.filter(isLive);
  const urgent = live
    .map((o) => ({ order: o, concern: concernOf(o as never, now) }))
    .filter((x) => x.concern.level === "URGENT");

  if (urgent.length === 0) {
    return { looked: live.length, urgent: 0, raised: [] };
  }

  // Which of these we have already shouted about recently. One query for all of
  // them rather than one per order — this runs every few minutes all night.
  const recent = await prisma.notificationLog.findMany({
    where: {
      event: EVENT,
      entityType: "order",
      entityId: { in: urgent.map((x) => x.order.id) },
      createdAt: { gte: new Date(now.getTime() - REALERT_MS) },
    },
    select: { entityId: true },
  });
  const alreadyRaised = new Set(recent.map((r) => r.entityId));

  const raised: WatchResult["raised"] = [];

  for (const { order, concern } of urgent) {
    if (alreadyRaised.has(order.id)) continue;
    await raise(order.id, order.orderCode, concern);
    raised.push({ orderCode: order.orderCode, message: concern.message, action: concern.action });
  }

  return { looked: live.length, urgent: urgent.length, raised };
}

/**
 * One alert, and the record that it happened.
 *
 * The log row is written **whether or not the push succeeded**, and that is
 * deliberate: it is what stops the same order being retried every few minutes
 * when nobody has notifications enabled at all. The row says "we raised this",
 * not "somebody received it" — and the mail panel on `/admin/settings` is where
 * a delivery failure becomes visible, exactly as it is for every other message.
 */
async function raise(orderId: string, orderCode: string, concern: Concern): Promise<void> {
  const sent = await sendPush(
    { roles: ["OWNER", "DISPATCHER", "SUPPORT"] },
    {
      title: `${orderCode} needs you`,
      body: `${concern.message}${concern.action ? ` — ${concern.action}.` : ""}`,
      url: `/admin/orders/${orderId}`,
      // Tagged per order, so a second alert about the same one replaces the
      // first on the lock screen rather than stacking.
      tag: `stalled-${orderId}`,
    }
  ).catch(() => 0);

  await prisma.notificationLog
    .create({
      data: {
        channel: "PUSH",
        event: EVENT,
        recipient: "dispatch",
        subject: `${orderCode}: ${concern.message}`,
        status: sent > 0 ? "SENT" : "FAILED",
        error: sent > 0 ? null : "No dispatch device is subscribed to notifications",
        entityType: "order",
        entityId: orderId,
      },
    })
    .catch(() => {});
}
