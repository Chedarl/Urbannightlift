"use client";

import { useEffect, useState } from "react";

import type { ActiveOrder } from "@/lib/orders/activeOrder";

/**
 * Whether this viewer has something in flight, refreshed while they browse.
 *
 * ## One poll, not one per component
 *
 * Every live surface in this app polls on its own timer — the map every 7 s,
 * the timeline every 10 s, the rider card every 30 s, the watch page every
 * 10 s. That is defensible when each is a whole screen a customer is staring
 * at. It is not defensible for a strip that appears on *every* screen: adding
 * a fifth independent interval would mean a phone on Cameroonian mobile data
 * making four requests a minute for a banner, all night, mostly to be told
 * nothing has changed.
 *
 * So this is a module-level subscription. However many components ask, there is
 * one timer and one request, and the answer is shared.
 *
 * ## Slower than the map, on purpose
 *
 * Thirty seconds. The strip says "collecting your order · about 12 min"; the
 * map says where the bike is. A stage changes a handful of times in a delivery
 * and a minute of lag on a banner costs nothing, where a minute of lag on a
 * moving dot is the whole feature. Polling it at map speed would triple this
 * app's background traffic to make a label marginally fresher.
 */

const POLL_MS = 30_000;

let current: ActiveOrder | null = null;
let loaded = false;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(o: ActiveOrder | null) => void>();

async function refresh() {
  try {
    const res = await fetch("/api/orders/active", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { order?: ActiveOrder | null };
    current = data.order ?? null;
  } catch {
    /*
      A failed poll keeps the last answer rather than clearing it. On a night
      network a dropped request is ordinary, and a strip that vanishes and
      reappears every time a packet is lost reads as a bug in the delivery, not
      in the connection.
    */
    return;
  } finally {
    loaded = true;
    for (const fn of listeners) fn(current);
  }
}

export function useActiveOrder(): { order: ActiveOrder | null; loaded: boolean } {
  const [order, setOrder] = useState<ActiveOrder | null>(current);
  const [isLoaded, setIsLoaded] = useState(loaded);

  useEffect(() => {
    const fn = (o: ActiveOrder | null) => {
      setOrder(o);
      setIsLoaded(true);
    };
    listeners.add(fn);

    // First subscriber starts the timer; the rest join the one already running.
    if (listeners.size === 1) {
      void refresh();
      timer = setInterval(() => void refresh(), POLL_MS);
    } else if (loaded) {
      fn(current);
    }

    return () => {
      listeners.delete(fn);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);

  return { order, loaded: isLoaded };
}

/**
 * Forget what we know, now.
 *
 * Called on sign-out and after an order is confirmed received. Without it the
 * strip keeps showing the last answer for up to thirty seconds after the
 * customer has said "yes, I got it" — which is the exact moment a lingering
 * "on the way" is most jarring.
 */
export function clearActiveOrder() {
  current = null;
  for (const fn of listeners) fn(null);
  void refresh();
}
