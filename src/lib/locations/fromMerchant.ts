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

function pinToLocation(m: PinnedMerchant, zones: ZoneData[], source: string): SelectedLocation {
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
    source,
  };
}

export function merchantToLocation(m: PinnedMerchant, zones: ZoneData[]): SelectedLocation {
  return pinToLocation(m, zones, "merchant");
}

/**
 * A business found on Google Maps turned into the same pickup point.
 *
 * The conversion is identical and deliberately so: the *place* is as real as a
 * catalogued merchant's — real coordinates, in a real zone, priced by the same
 * tariff — and quoting a customer a different fee for having found the shop
 * through search rather than through our list would be arbitrary.
 *
 * What is uncertain about a discovery is the **business**, not the location: we
 * have not called them, do not know their hours, and hold no menu. That
 * uncertainty is carried where it belongs — `verified: false` on the merchant
 * row and the "found on the map" line on the card — and not smuggled in here as
 * a worse zone.
 *
 * The one thing that changes is `source`, so anything downstream that needs to
 * know where a pin came from can tell, and so a grep for what discovery touches
 * has something to find.
 */
export function placeToLocation(
  p: { name: string; formattedAddress: string; latitude: number; longitude: number; nationalPhone: string | null },
  zones: ZoneData[]
): SelectedLocation {
  return pinToLocation(
    {
      merchantName: p.name,
      neighbourhood: null,
      address: p.formattedAddress || null,
      landmark: null,
      latitude: p.latitude,
      longitude: p.longitude,
      phone: p.nationalPhone,
    },
    zones,
    "places"
  );
}
