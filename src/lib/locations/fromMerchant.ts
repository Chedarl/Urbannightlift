import { nearestZone, type ZoneTier } from "@/lib/orders/pricing";
import { encodePlusCode } from "@/lib/locations/plusCode";
import { tierToStatus, type SelectedLocation } from "@/lib/locations/types";

/**
 * A catalogued business turned into a pickup point.
 *
 * Choosing a merchant has to set the pickup location, or the rider leaves with
 * a name and nothing else — no pin, no zone, no fee. That conversion lived
 * inside the merchant picker, and now two screens do it: the picker, and the
 * pharmacy list on the medicine page. Two copies of "which zone is this and what
 * does it cost" is exactly how a browse page and a search box start quoting
 * different fees for the same shop, so there is one.
 *
 * The zone is resolved from the coordinates rather than from anything stored on
 * the merchant, so a catalogue row written months ago is priced against today's
 * zones.
 */

export interface ZoneData {
  id: string;
  zoneName: string;
  tier: ZoneTier;
  feeXaf: number;
  centroidLat: number | null;
  centroidLng: number | null;
}

export interface PinnedMerchant {
  merchantName: string;
  neighbourhood: string | null;
  address: string | null;
  landmark: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
}

export function merchantToLocation(m: PinnedMerchant, zones: ZoneData[]): SelectedLocation {
  const z = nearestZone(m.latitude, m.longitude, zones);
  return {
    primaryName: m.merchantName,
    neighbourhood: m.neighbourhood ?? "Yaoundé",
    arrondissement: "YAOUNDE_PERIPHERY",
    latitude: m.latitude,
    longitude: m.longitude,
    plusCode: encodePlusCode(m.latitude, m.longitude) || null,
    landmark: m.landmark ?? m.address ?? null,
    directions: null,
    contactAtLocation: m.phone,
    zoneId: z?.id ?? null,
    zoneName: z?.zoneName ?? null,
    tier: z?.tier ?? null,
    feeXaf: z?.feeXaf ?? null,
    serviceStatus: tierToStatus(z?.tier ?? null),
    source: "merchant",
  };
}
