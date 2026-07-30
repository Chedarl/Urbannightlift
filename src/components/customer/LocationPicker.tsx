"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, useMapEvents, useMap } from "react-leaflet";
import { BaseTiles } from "@/components/shared/BaseTiles";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, MapPin } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { nearestZone, TIER_META, type ZoneTier } from "@/lib/orders/pricing";
import { cn } from "@/lib/utils";

export interface PickedPoint {
  lat: number;
  lng: number;
  label: string;
  zoneId: string | null;
  zoneName: string | null;
  tier: ZoneTier | null;
  feeXaf: number | null;
}

interface ZoneData {
  id: string;
  zoneName: string;
  tier: ZoneTier;
  feeXaf: number;
  centroidLat: number | null;
  centroidLng: number | null;
}

const YAOUNDE: [number, number] = [3.848, 11.502];

function pinIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-100%)"><svg width="30" height="40" viewBox="0 0 30 40" fill="none"><path d="M15 0C6.7 0 0 6.7 0 15c0 10 15 25 15 25s15-15 15-25C30 6.7 23.3 0 15 0z" fill="${color}"/><circle cx="15" cy="15" r="6" fill="#0a0710"/></svg></div>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
  });
}
const pickupIcon = pinIcon("#d4af37");
const deliveryIcon = pinIcon("#9645de");

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ point }: { point: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo(point, Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [point, map]);
  return null;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&accept-language=fr`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    const a = data.address ?? {};
    const parts = [a.road || a.neighbourhood || a.suburb, a.suburb || a.city_district, a.city || a.town || "Yaoundé"].filter(Boolean);
    return parts.length ? [...new Set(parts)].join(", ") : data.display_name?.split(",").slice(0, 2).join(",") || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

export function LocationPicker({
  accent = "#9645de",
  pickup,
  delivery,
  onChange,
}: {
  accent?: string;
  pickup: PickedPoint | null;
  delivery: PickedPoint | null;
  onChange: (which: "pickup" | "delivery", point: PickedPoint | null) => void;
}) {
  const { t, locale } = useTranslation();
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [active, setActive] = useState<"pickup" | "delivery">("pickup");
  const [fly, setFly] = useState<[number, number] | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    fetch("/api/zones")
      .then((r) => r.json())
      .then((d) => setZones(d.zones ?? []))
      .catch(() => {});
  }, []);

  const resolve = useCallback(
    async (lat: number, lng: number): Promise<PickedPoint> => {
      const z = nearestZone(lat, lng, zones);
      const label = await reverseGeocode(lat, lng);
      return {
        lat,
        lng,
        label,
        zoneId: z?.id ?? null,
        zoneName: z?.zoneName ?? null,
        tier: z?.tier ?? null,
        feeXaf: z?.feeXaf ?? null,
      };
    },
    [zones]
  );

  const place = useCallback(
    async (lat: number, lng: number) => {
      if (busy.current) return;
      busy.current = true;
      const point = await resolve(lat, lng);
      onChange(active, point);
      busy.current = false;
    },
    [active, onChange, resolve]
  );

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFly([pos.coords.latitude, pos.coords.longitude]);
        place(pos.coords.latitude, pos.coords.longitude);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [place]);

  const rows = useMemo(
    () =>
      (["pickup", "delivery"] as const).map((which) => {
        const p = which === "pickup" ? pickup : delivery;
        return { which, p };
      }),
    [pickup, delivery]
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Which point to place */}
      <div className="flex gap-2">
        {(["pickup", "delivery"] as const).map((which) => (
          <button
            key={which}
            type="button"
            onClick={() => setActive(which)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
              active === which ? "text-ink-950" : "border-ink-700 bg-ink-800 text-mist-400"
            )}
            style={active === which ? { backgroundColor: which === "pickup" ? "#d4af37" : accent, borderColor: "transparent" } : undefined}
          >
            <MapPin className="h-4 w-4" />
            {which === "pickup" ? t("orderForm.pickupLocation") : t("orderForm.deliveryLocation")}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-ink-700" style={{ height: 260 }}>
        <MapContainer center={YAOUNDE} zoom={12} className="h-full w-full" scrollWheelZoom={false}>
          <BaseTiles />
          <ClickHandler onClick={place} />
          <Recenter point={fly} />
          {pickup && (
            <Marker
              position={[pickup.lat, pickup.lng]}
              icon={pickupIcon}
              draggable
              eventHandlers={{ dragend: (e) => { const ll = e.target.getLatLng(); setActive("pickup"); place(ll.lat, ll.lng); } }}
            />
          )}
          {delivery && (
            <Marker
              position={[delivery.lat, delivery.lng]}
              icon={deliveryIcon}
              draggable
              eventHandlers={{ dragend: (e) => { const ll = e.target.getLatLng(); setActive("delivery"); place(ll.lat, ll.lng); } }}
            />
          )}
        </MapContainer>
        <button
          type="button"
          onClick={useMyLocation}
          className="absolute bottom-3 right-3 z-[1000] flex items-center gap-1.5 rounded-full bg-ink-950/90 px-3 py-2 text-xs font-medium text-mist-100 shadow-lg ring-1 ring-ink-600"
        >
          <Crosshair className="h-4 w-4 text-gold-400" /> {locale === "fr" ? "Ma position" : "My location"}
        </button>
      </div>
      <p className="text-xs text-mist-500">
        {locale === "fr"
          ? "Touchez la carte pour placer le point sélectionné, puis glissez pour ajuster."
          : "Tap the map to drop the selected pin, then drag to fine-tune."}
      </p>

      {/* Selected points summary */}
      <div className="flex flex-col gap-2">
        {rows.map(({ which, p }) => (
          <div key={which} className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/50 px-3 py-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: which === "pickup" ? "#d4af37" : accent }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-mist-100">
                {p ? p.label : which === "pickup" ? t("orderForm.pickupLocation") : t("orderForm.deliveryLocation")}
              </p>
              {p?.tier && (
                <p className="text-[11px]" style={{ color: TIER_META[p.tier].hex }}>
                  {p.zoneName} · {locale === "fr" ? TIER_META[p.tier].labelFr : TIER_META[p.tier].label}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
