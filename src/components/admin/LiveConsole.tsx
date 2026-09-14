"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AlertTriangle, Eye, Phone, MessageCircle, MapPin, Bike, RefreshCw, Radio, CircleSlash } from "lucide-react";
import { buildWaLink } from "@/lib/whatsapp/links";
import { formatXaf, cn } from "@/lib/utils";
import type { ConcernLevel, TrackingState } from "@/lib/orders/liveWatch";

const LiveFleetMap = dynamic(() => import("@/components/admin/LiveFleetMap").then((m) => m.LiveFleetMap), {
  ssr: false,
});

/**
 * The customer-service console: everything happening tonight, worst first.
 *
 * Dispatch could already see a list of orders and, buried on one order's page,
 * a rider's last coordinates. Nothing put the two together and nothing raised a
 * hand. An order sitting unpriced for forty minutes looked exactly like one
 * that arrived thirty seconds ago, and a rider whose phone stopped reporting an
 * hour into a run looked exactly like one riding down the road.
 *
 * So this screen is built around the phone call: every row says what is wrong,
 * what to do about it, and carries the two numbers needed to do it. Nothing on
 * it is a place to file something — it is a place to notice something and pick
 * up the phone before the customer does.
 */

interface LiveOrder {
  id: string;
  orderCode: string;
  orderStatus: string;
  serviceType: string;
  isTest: boolean;
  createdAt: string;
  stage: string;
  concern: { level: ConcernLevel; message: string; action: string };
  onTheRoad: boolean;
  tracking: TrackingState;
  fixAgeMinutes: number | null;
  riderLat: number | null;
  riderLng: number | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  pickupLocation: string;
  deliveryLocation: string;
  feeXaf: number | null;
  customerName: string;
  customerPhone: string;
  rider: { id: string; name: string; phone: string | null; vehicleRef: string | null; isOnline: boolean } | null;
}

interface LiveRider {
  id: string;
  name: string;
  phone: string | null;
  vehicleRef: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  activeOrders: number;
}

interface Payload {
  now: string;
  orders: LiveOrder[];
  riders: LiveRider[];
  counts: { urgent: number; watch: number; onTheRoad: number; total: number };
}

/** Fast enough that a dispatcher trusts it, slow enough not to hammer the database. */
const POLL_MS = 12_000;

const TRACK_LABEL: Record<TrackingState, string> = {
  LIVE: "Position live",
  STALE: "Position going cold",
  LOST: "Position lost",
  NEVER: "Never shared",
};

export function LiveConsole() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/live", { cache: "no-store" });
      if (!res.ok) {
        setError(res.status === 403 ? "This screen is for dispatch only." : "Couldn't refresh — retrying.");
        return;
      }
      setData(await res.json());
      setCheckedAt(new Date());
      setError(null);
    } catch {
      // Offline or a flaky connection. Keep the last reading on screen rather
      // than blanking a console somebody is working from.
      setError("Couldn't refresh — retrying.");
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (!data) {
    return (
      <p className="rounded-2xl border border-ink-800 bg-ink-900 p-6 text-sm text-mist-400">
        {error ?? "Loading tonight…"}
      </p>
    );
  }

  const { counts, orders, riders } = data;
  const onTheRoad = orders.filter((o) => o.onTheRoad);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Tally label="Need attention" value={counts.urgent} tone={counts.urgent > 0 ? "urgent" : "calm"} />
        <Tally label="Worth watching" value={counts.watch} tone={counts.watch > 0 ? "watch" : "calm"} />
        <Tally label="On the road" value={counts.onTheRoad} tone="calm" />
        <Tally label="Live orders" value={counts.total} tone="calm" />
        <button
          type="button"
          onClick={load}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs text-mist-400 hover:text-mist-200"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-mist-500">
        <span className={cn("h-1.5 w-1.5 rounded-full", error ? "bg-caution" : "animate-pulse bg-safe")} />
        {error ?? "Updating every 12 seconds"}
        {checkedAt && ` · last checked ${checkedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
      </p>

      {/* Where everyone is. Only riders who have actually reported a position
          appear — an empty map is honest, an invented pin is not. */}
      <LiveFleetMap
        riders={onTheRoad
          .filter((o) => o.riderLat != null && o.riderLng != null)
          .map((o) => ({
            orderId: o.id,
            orderCode: o.orderCode,
            riderName: o.rider?.name ?? "Rider",
            lat: o.riderLat!,
            lng: o.riderLng!,
            tracking: o.tracking,
            fixAgeMinutes: o.fixAgeMinutes,
            focused: focus === o.id,
          }))}
      />

      <section>
        <h2 className="mb-2 font-display text-sm font-semibold text-mist-200">Tonight, worst first</h2>
        {orders.length === 0 ? (
          <p className="rounded-2xl border border-ink-800 bg-ink-900 p-6 text-sm text-mist-500">
            Nothing live right now. Everything that came in tonight is finished.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {orders.map((o) => (
              <OrderRow key={o.id} order={o} focused={focus === o.id} onFocus={() => setFocus(focus === o.id ? null : o.id)} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-sm font-semibold text-mist-200">Riders</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {riders.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5"
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  r.isOnline ? "bg-safe" : "bg-ink-700"
                )}
                title={r.isOnline ? "Online" : "Offline"}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-mist-200">{r.name}</p>
                <p className="truncate text-xs text-mist-500">
                  {r.activeOrders > 0 ? `${r.activeOrders} order${r.activeOrders === 1 ? "" : "s"} out` : "Free"}
                  {r.vehicleRef ? ` · ${r.vehicleRef}` : ""}
                </p>
              </div>
              {r.phone && <Reach phone={r.phone} message={`Urban Night Lift — ${r.name}, checking in.`} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function OrderRow({ order: o, focused, onFocus }: { order: LiveOrder; focused: boolean; onFocus: () => void }) {
  const urgent = o.concern.level === "URGENT";
  const watch = o.concern.level === "WATCH";

  return (
    <li
      className={cn(
        "rounded-2xl border p-3",
        urgent && "border-restricted/50 bg-restricted/[0.06]",
        watch && "border-caution/40 bg-caution/[0.04]",
        !urgent && !watch && "border-ink-800 bg-ink-900",
        focused && "ring-1 ring-violet-400/60"
      )}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <Link href={`/admin/orders/${o.id}`} className="font-display text-sm font-bold text-gold-400 hover:underline">
          {o.orderCode}
        </Link>
        {o.isTest && (
          <span className="rounded bg-ink-800 px-1.5 py-0.5 text-xs font-bold uppercase text-mist-500">Test</span>
        )}
        <span className="rounded bg-ink-800 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-mist-400">
          {o.stage}
        </span>
        {o.onTheRoad && <TrackingChip state={o.tracking} ageMinutes={o.fixAgeMinutes} />}
        {o.feeXaf != null && <span className="ml-auto text-xs tabular-nums text-mist-400">{formatXaf(o.feeXaf)}</span>}
      </div>

      <p
        className={cn(
          "mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed",
          urgent ? "text-restricted" : watch ? "text-caution" : "text-mist-400"
        )}
      >
        {(urgent || watch) && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        <span>
          {o.concern.message}
          {o.concern.action && <strong className="ml-1 font-semibold">— {o.concern.action}.</strong>}
        </span>
      </p>

      <p className="mt-1.5 truncate text-xs text-mist-500">
        <MapPin className="mr-1 inline h-3 w-3" />
        {o.pickupLocation} → {o.deliveryLocation}
      </p>

      {/* Both numbers, on the row. The whole point of this screen is that
          noticing something and acting on it are the same gesture. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-mist-500">{o.customerName}</span>
        <Reach phone={o.customerPhone} message={`Urban Night Lift — about your order ${o.orderCode}.`} />

        {o.rider ? (
          <>
            <span className="ml-2 mr-1 flex items-center gap-1 text-xs text-mist-500">
              <Bike className="h-3 w-3" /> {o.rider.name}
            </span>
            {o.rider.phone ? (
              <Reach phone={o.rider.phone} message={`Urban Night Lift — order ${o.orderCode}, checking in.`} />
            ) : (
              <span className="text-xs text-mist-600">no number on file</span>
            )}
          </>
        ) : (
          <span className="ml-2 flex items-center gap-1 text-xs text-mist-500">
            <CircleSlash className="h-3 w-3" /> no rider yet
          </span>
        )}

        {o.onTheRoad && o.riderLat != null && o.riderLng != null && (
          <button
            type="button"
            onClick={onFocus}
            className="ml-auto flex items-center gap-1 rounded-lg border border-violet-500/40 px-2 py-1 text-xs font-semibold text-violet-300 hover:bg-violet-500/10"
          >
            <Eye className="h-3 w-3" /> {focused ? "Hide on map" : "Show on map"}
          </button>
        )}
      </div>
    </li>
  );
}

/** Call or message, in one tap each. Both open the phone's own app. */
function Reach({ phone, message }: { phone: string; message: string }) {
  const digits = phone.replace(/[^\d]/g, "");
  return (
    <span className="flex items-center gap-1">
      <a
        href={`tel:+${digits}`}
        className="flex items-center gap-1 rounded-lg border border-ink-700 px-2 py-1 text-xs font-semibold text-mist-300 hover:border-safe/50 hover:text-safe"
      >
        <Phone className="h-3 w-3" /> Call
      </a>
      <a
        href={buildWaLink(phone, message)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 rounded-lg border border-ink-700 px-2 py-1 text-xs font-semibold text-mist-300 hover:border-safe/50 hover:text-safe"
      >
        <MessageCircle className="h-3 w-3" /> Message
      </a>
    </span>
  );
}

function TrackingChip({ state, ageMinutes }: { state: TrackingState; ageMinutes: number | null }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
        state === "LIVE" && "bg-safe/15 text-safe",
        state === "STALE" && "bg-caution/15 text-caution",
        (state === "LOST" || state === "NEVER") && "bg-restricted/15 text-restricted"
      )}
    >
      <Radio className="h-2.5 w-2.5" />
      {TRACK_LABEL[state]}
      {ageMinutes != null && state !== "LIVE" && ` · ${ageMinutes}m`}
    </span>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone: "urgent" | "watch" | "calm" }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        tone === "urgent" && "border-restricted/50 bg-restricted/[0.07]",
        tone === "watch" && "border-caution/40 bg-caution/[0.05]",
        tone === "calm" && "border-ink-800 bg-ink-900"
      )}
    >
      <p
        className={cn(
          "font-display text-xl font-bold tabular-nums",
          tone === "urgent" ? "text-restricted" : tone === "watch" ? "text-caution" : "text-mist-200"
        )}
      >
        {value}
      </p>
      <p className="text-xs uppercase tracking-wide text-mist-500">{label}</p>
    </div>
  );
}
