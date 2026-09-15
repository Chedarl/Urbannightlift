"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { useTranslation } from "@/lib/i18n";
import { useActiveOrder } from "@/lib/orders/useActiveOrder";

/**
 * What is happening to your order, on every screen, without asking.
 *
 * ## The gap this fills
 *
 * There was no persistent order state anywhere in this product. Tracking was a
 * page you navigated to and typed an order code into; the live timeline was
 * buried inside a collapsed `<details>` at the bottom of the confirmation
 * screen. So a customer who placed an order and then went to look at anything
 * else had no way of knowing whether a rider had been assigned short of going
 * back and hunting for it.
 *
 * "Live Activity integration — real-time status bars replacing push
 * notification spam during courier transit" is the first trend named in the
 * 2025 award research, and Taobao's Apple Design Award was specifically for the
 * *seamless transition between item discovery and courier tracking*. This is
 * that transition: there is no transition, because the order never leaves the
 * screen.
 *
 * It also does the thing push notifications were being asked to do, better and
 * without permission — which matters here, since VAPID keys are unset in
 * production and `sendPush` currently returns zero.
 *
 * ## Why it is quiet
 *
 * A banner on every screen earns its place by being *small* and by being right.
 * One line, one bar, one tap. It never announces, never animates on a timer,
 * and shows a pulsing dot only while something is genuinely moving — a status
 * light that pulses when nothing is happening teaches people to stop reading
 * it.
 *
 * It carries the stage, the rider's first name and an arrival time, and that is
 * the whole list. No address, no phone number, no OTP: this is visible over
 * every screen in the app, including whatever is behind somebody's shoulder on
 * a taxi.
 */

/**
 * Where it would be noise.
 *
 * On the order's own screen everything here is already on the page in more
 * detail, so a strip repeating it is a second copy of the same facts competing
 * with the first. On staff screens it is simply the wrong person's order.
 */
const HIDE_ON = ["/admin", "/rider", "/merchant", "/order/confirmation", "/w/", "/q/"];

/** The stages where a bike is actually moving. Everything else waits. */
const MOVING = new Set(["pickup", "collected", "onTheWay"]);

export function LiveOrderStrip() {
  const pathname = usePathname() ?? "";
  const { t, locale } = useTranslation();
  const { order } = useActiveOrder();

  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;
  if (!order) return null;

  const fr = locale === "fr";
  const moving = MOVING.has(order.statusKey);

  return (
    <Link
      href={`/order/confirmation/${order.orderCode}`}
      /*
        Sticky under the header rather than fixed over the page: it belongs to
        the chrome, and a floating element a customer cannot scroll away from
        is the thing "notification spam" means on a small screen.
      */
      className="glass sticky top-0 z-30 block border-x-0 border-t-0 animate-rise-in"
    >
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-2">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
          {/* Only while something moves. A light that always pulses says nothing. */}
          {moving && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-safe opacity-70" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${moving ? "bg-safe" : "bg-gold-400"}`}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-mist-100">
            {t(`customerStatus.${order.statusKey}`)}
            {order.riderFirstName && (
              <span className="font-normal text-mist-400">
                {fr ? " · " : " · "}
                {order.riderFirstName}
              </span>
            )}
          </span>

          {/*
            "About", always. There is no routing engine behind this number and
            an arrival time that keeps passing is worse than none.
          */}
          <span className="mt-1 flex items-center gap-2">
            <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-ink-800">
              <span
                className="block h-full rounded-full bg-gold-400 transition-[width] duration-700"
                style={{ width: `${Math.round(order.progress * 100)}%` }}
              />
            </span>
            <span className="shrink-0 text-xs tabular-nums text-mist-500">
              {order.etaMinutes != null
                ? fr
                  ? `~${order.etaMinutes} min`
                  : `~${order.etaMinutes} min`
                : fr
                  ? "en route"
                  : "on its way"}
            </span>
          </span>
        </span>

        <ChevronRight className="h-4 w-4 shrink-0 text-mist-500" />
      </div>
    </Link>
  );
}
