"use client";

import { useEffect, useMemo, useState } from "react";

import { quoteDeliveryFee, type ZonePricing } from "@/lib/orders/pricing";
import { DEFAULT_FARE, type FareRules } from "@/lib/orders/fare";
import type { SelectedLocation } from "@/lib/locations/types";

/**
 * What the delivery will cost, while they are still choosing.
 *
 * ## The complaint this answers
 *
 * Every order screen said *"delivery is worked out on the next screen"* and
 * then produced a number. The owner relayed the customer verdict on that
 * plainly: people do not trust a price that appears at the till. The research
 * into Meituan and Ele.me said the same thing from the other direction — both
 * weld the running total to the bottom of every screen, and the single most
 * valuable thing in that study was that **you never have to wonder what it
 * costs**.
 *
 * So the fee is quoted here, live, as pins are dropped.
 *
 * ## Why this is not a second pricing implementation
 *
 * It is the reason this file is three functions long. The fee is computed by
 * `quoteDeliveryFee` — the *same* function `POST /api/orders` prices with, from
 * the same rules row, through the same `quoteFare`. This module only gathers
 * the inputs that already exist on the screen (two pins, two zones) and hands
 * them over.
 *
 * Writing the arithmetic again on the client is how the quoted price and the
 * charged price drift apart, and a delivery business whose screen says 1,800
 * and whose receipt says 2,400 has a bigger problem than an ugly form.
 *
 * ## What it refuses to do
 *
 * It returns `null` rather than guessing. With no delivery zone and no pins
 * there is genuinely nothing to price, and the screens say so in words instead
 * of printing a number that would be wrong. `estimated` is passed straight
 * through so a zone-only figure can be labelled as approximate — an honest
 * "about 1,500" beats a confident wrong 1,500.
 */

interface ZoneRow extends ZonePricing {
  zoneName: string;
  centroidLat: number | null;
  centroidLng: number | null;
}

export interface LiveFare {
  totalXaf: number;
  /** Distance was unknown; this came from the zone alone. Say "about". */
  estimated: boolean;
  /** Every step, in order, for a screen with room to explain itself. */
  lines: { label: string; labelFr: string; amountXaf: number }[];
}

export interface LiveFareInput {
  pickup: SelectedLocation | null;
  delivery: SelectedLocation | null;
  /** The rider shops or collects rather than only carrying. */
  errand?: boolean;
  /** Medicine carries its own surcharge, decided by the zone. */
  isMedicine?: boolean;
}

/**
 * Loads the tariff and the zone table once, then quotes on demand.
 *
 * Both come from public endpoints that the order forms already had reason to
 * call. While they are in flight `quote` returns `null`, which renders as the
 * same "worked out next" sentence the screens showed before — a blank is never
 * filled with a placeholder price.
 */
export function useLiveFare() {
  const [zones, setZones] = useState<ZoneRow[] | null>(null);
  const [rules, setRules] = useState<FareRules | null>(null);

  useEffect(() => {
    let live = true;

    fetch("/api/zones")
      .then((r) => (r.ok ? r.json() : { zones: [] }))
      .then((d) => live && setZones(Array.isArray(d.zones) ? d.zones : []))
      .catch(() => live && setZones([]));

    /*
      A missing or malformed tariff falls back to `DEFAULT_FARE` rather than
      leaving the bar blank. The defaults are the same constants the server
      starts from, so the worst case is that an owner's edited minimum is not
      reflected for one page load — not a wrong number and not an empty bar.
    */
    fetch("/api/settings")
      .then((r): unknown => (r.ok ? r.json() : {}))
      .then((d) => {
        const sent = (d as { fareRules?: unknown } | null)?.fareRules;
        if (live) setRules(isFareRules(sent) ? sent : DEFAULT_FARE);
      })
      .catch(() => live && setRules(DEFAULT_FARE));

    return () => {
      live = false;
    };
  }, []);

  const byId = useMemo(() => {
    const map = new Map<string, ZoneRow>();
    for (const z of zones ?? []) map.set(z.id, z);
    return map;
  }, [zones]);

  return useMemo(() => {
    function quote({ pickup, delivery, errand, isMedicine }: LiveFareInput): LiveFare | null {
      if (!rules || zones === null) return null;

      const pickupZone = pickup?.zoneId ? (byId.get(pickup.zoneId) ?? null) : null;
      const deliveryZone = delivery?.zoneId ? (byId.get(delivery.zoneId) ?? null) : null;

      const fare = quoteDeliveryFee(pickupZone, deliveryZone, {
        pickup: coords(pickup),
        delivery: coords(delivery),
        rules,
        errand,
        isMedicine,
        // The late-night band is a stated hour, so the customer's own clock is
        // the right one to read it from — they are ordering from Yaoundé.
        hour: new Date().getHours(),
      });
      if (!fare) return null;

      return { totalXaf: fare.totalXaf, estimated: fare.estimated, lines: fare.lines };
    }

    /*
      The zone table is handed back as well as used.
      A screen that turns a catalogued merchant into a pickup point needs it —
      `merchantToLocation` resolves the zone from the coordinates — and the
      alternative is a third `/api/zones` fetch on a page that has already made
      two. The row shape is `ZoneData`'s by construction.
    */
    return { quote, zones: zones ?? [], ready: rules !== null && zones !== null };
  }, [rules, zones, byId]);
}

function coords(loc: SelectedLocation | null): { lat: number; lng: number } | null {
  if (!loc || loc.latitude == null || loc.longitude == null) return null;
  // 0,0 is the Atlantic off Ghana and is what an unset pin serialises to. It
  // has cost this product a real bug before, so it is refused here too.
  if (loc.latitude === 0 && loc.longitude === 0) return null;
  return { lat: loc.latitude, lng: loc.longitude };
}

/**
 * A tariff that arrived over the wire is untrusted until it has every field.
 *
 * The bands are what price an order now, so they are what this checks — an
 * earlier version validated `minimumXaf`/`perKmXaf`/`errandXaf` and would have
 * happily accepted a response with no bands in it at all, quoting every trip at
 * the bare minimum while the server charged the real figure. A screen that says
 * 850 against a receipt that says 2,000 is worse than a screen that says
 * nothing, which is what the `DEFAULT_FARE` fallback gives instead.
 */
function isFareRules(v: unknown): v is FareRules {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  const ladder = (x: unknown) =>
    Array.isArray(x) &&
    x.length > 0 &&
    x.every(
      (b) =>
        b != null &&
        typeof b === "object" &&
        typeof (b as Record<string, unknown>).upToKm === "number" &&
        typeof (b as Record<string, unknown>).xaf === "number"
    );
  return (
    ladder(r.bands) &&
    ladder(r.errandBands) &&
    typeof r.minimumXaf === "number" &&
    typeof r.tierSurchargeXaf === "object" &&
    r.tierSurchargeXaf !== null
  );
}
