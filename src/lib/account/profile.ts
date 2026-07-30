"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { nearestZone, type ZoneTier } from "@/lib/orders/pricing";
import { tierToStatus, type SelectedLocation } from "@/lib/locations/types";
import type { OrderDraft } from "@/lib/orders/draft";
import type { PaymentMethod, PreferredLanguage, ServiceType } from "@prisma/client";

/**
 * The signed-in customer, shared across every order form.
 *
 * Six forms mount this hook and each of them would otherwise fetch the same
 * profile on every keystroke-triggered remount, so the in-flight request is
 * cached at module scope and reused. The cache is cleared on sign-in and
 * sign-out rather than expiring on a timer — a stale name is only wrong at
 * exactly those two moments.
 */

export interface SavedAddress {
  id: string;
  label: string;
  locationText: string;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
  zoneId: string | null;
}

export interface LastOrderSummary {
  orderCode: string;
  serviceType: ServiceType;
  itemDescription: string;
  serviceDetails: Record<string, unknown> | null;
  quantity: number;
  declaredValueXaf: number;
  pickupLocation: string;
  pickupLandmark: string | null;
  deliveryLocation: string;
  deliveryLandmark: string | null;
  paymentMethod: PaymentMethod;
  feeXaf: number | null;
  isMedicine: boolean;
}

export interface CustomerProfile {
  fullName: string;
  whatsappNumber: string;
  preferredLanguage: PreferredLanguage;
  totalOrders: number;
  addresses: SavedAddress[];
  lastOrder: LastOrderSummary | null;
}

let cached: Promise<CustomerProfile | null> | null = null;

function load(): Promise<CustomerProfile | null> {
  cached ??= fetch("/api/account/me")
    .then((r) => (r.ok ? r.json() : { customer: null }))
    .then((d) => (d.customer as CustomerProfile | null) ?? null)
    .catch(() => null);
  return cached;
}

/** Call after signing in or out, or after saving an address. */
export function refreshProfile(): void {
  cached = null;
}

export function useCustomerProfile(): { profile: CustomerProfile | null; loaded: boolean } {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    load().then((p) => {
      if (!alive) return;
      setProfile(p);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { profile, loaded };
}

/**
 * The digits a customer types under the +237 prefix the forms already show.
 * Storing the normalized `237XXXXXXXXX` and pasting it back verbatim would
 * render as "+237 237690…", so the country code is stripped for display.
 */
export function localPhone(whatsappNumber: string): string {
  const digits = whatsappNumber.replace(/\D/g, "");
  return digits.startsWith("237") ? digits.slice(3) : digits;
}

/** Whether a stored name is a real one or the placeholder guest checkout writes. */
export function isRealName(name: string): boolean {
  const n = name.trim();
  return n.length > 1 && !/^(customer|client)\b/i.test(n);
}

/**
 * Fills the form once the profile arrives, without clobbering anything the
 * customer has already typed — the fetch resolves after first paint, and
 * overwriting a half-typed field would be worse than not prefilling at all.
 */
export function useProfilePrefill(apply: (profile: CustomerProfile) => void): void {
  const { profile } = useCustomerProfile();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!profile || done) return;
    apply(profile);
    setDone(true);
    // `apply` is a fresh closure each render; the `done` guard is what makes
    // this run exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, done]);
}

interface ZoneLike {
  id: string;
  zoneName: string;
  tier: ZoneTier;
  feeXaf: number;
  centroidLat: number | null;
  centroidLng: number | null;
}

/**
 * "Deliver here" from a saved place, carried in on `?deliverTo=<addressId>`.
 *
 * This is what makes a saved place a shortcut rather than just a label: tapping
 * "Home" in the portal drops you into an order form with the delivery address
 * already set, so it is genuinely different from the plain "Order" tab — which
 * is the whole reason the two are no longer the same button. The zone/tier/fee
 * are re-resolved live (via `savedAddressToLocation`), never replayed. Fires
 * once, and only when the param is present, so a normal order is untouched.
 */
export function useDeliverToAddress(apply: (loc: SelectedLocation) => void): void {
  const params = useSearchParams();
  const deliverTo = params.get("deliverTo");
  const { profile } = useCustomerProfile();
  const [zones, setZones] = useState<ZoneLike[] | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!deliverTo || done) return;
    fetch("/api/zones")
      .then((r) => r.json())
      .then((d) => setZones(d.zones ?? []))
      .catch(() => setZones([]));
  }, [deliverTo, done]);

  useEffect(() => {
    if (!deliverTo || done || !profile || zones == null) return;
    const addr = profile.addresses.find((a) => a.id === deliverTo);
    if (addr) apply(savedAddressToLocation(addr, zones));
    setDone(true);
    // `apply` is a fresh closure each render; the `done` guard runs this once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliverTo, done, profile, zones]);
}

/**
 * Rebuilds a form-ready location from a saved address.
 *
 * The zone, tier and fee are re-resolved from the pin against today's zones
 * rather than replayed from what was stored — a saved address must never quote
 * last month's price. Without coordinates we keep the text and let dispatch
 * price it, which is exactly what a free-typed address does today.
 */
export function savedAddressToLocation(addr: SavedAddress, zones: ZoneLike[]): SelectedLocation {
  const z = addr.lat != null && addr.lng != null ? nearestZone(addr.lat, addr.lng, zones) : null;
  return {
    primaryName: addr.locationText,
    neighbourhood: "",
    arrondissement: "",
    latitude: addr.lat ?? 0,
    longitude: addr.lng ?? 0,
    plusCode: null,
    landmark: addr.landmark,
    directions: null,
    contactAtLocation: null,
    zoneId: z?.id ?? addr.zoneId,
    zoneName: z?.zoneName ?? null,
    tier: z?.tier ?? null,
    serviceStatus: z ? tierToStatus(z.tier) : "REVIEW_REQUIRED",
    feeXaf: z?.feeXaf ?? null,
    source: "saved",
  };
}

/** Turns a past order into the draft the review screen already knows how to read. */
export function reorderDraft(profile: CustomerProfile, o: LastOrderSummary): OrderDraft {
  return {
    fullName: profile.fullName,
    whatsappNumber: profile.whatsappNumber,
    preferredLanguage: profile.preferredLanguage,
    serviceType: o.serviceType,
    itemDescription: o.itemDescription,
    serviceDetails: (o.serviceDetails ?? undefined) as OrderDraft["serviceDetails"],
    quantity: o.quantity,
    declaredValueXaf: o.declaredValueXaf,
    pickupLocation: o.pickupLocation,
    pickupLandmark: o.pickupLandmark ?? "",
    deliveryLocation: o.deliveryLocation,
    deliveryLandmark: o.deliveryLandmark ?? "",
    paymentMethod: o.paymentMethod,
    itemAlreadyPaid: false,
    riderPaysAtPickup: false,
    isFragile: false,
    needsTemperatureCare: false,
    isMedicine: o.isMedicine,
    acceptedTerms: true,
    estimatedFeeXaf: o.feeXaf,
  } as OrderDraft;
}
