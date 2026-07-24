import type { ZoneTier } from "@/lib/orders/pricing";

/** A fully confirmed location: catalogue/search choice + exact pin + directions. */
export interface SelectedLocation {
  primaryName: string;
  neighbourhood: string;
  arrondissement: string;
  latitude: number;
  longitude: number;
  plusCode: string | null;
  landmark: string | null;
  directions: string | null;
  contactAtLocation: string | null;
  // resolved from the confirmed coordinates
  zoneId: string | null;
  zoneName: string | null;
  tier: ZoneTier | null;
  serviceStatus: string; // PRIORITY | STANDARD | EXTENDED | REVIEW_REQUIRED | ... | BLOCKED
  feeXaf: number | null;
  source: string;
}

export const SERVICE_STATUS_META: Record<
  string,
  { en: string; fr: string; hex: string; ok: boolean }
> = {
  PRIORITY: { en: "Priority zone", fr: "Zone prioritaire", hex: "#2fae60", ok: true },
  STANDARD: { en: "Standard zone", fr: "Zone standard", hex: "#5aa9e6", ok: true },
  EXTENDED: { en: "Extended zone", fr: "Zone étendue", hex: "#d4af37", ok: true },
  REVIEW_REQUIRED: { en: "Dispatcher review", fr: "Vérification dispatcher", hex: "#e0a72f", ok: true },
  TEMPORARILY_UNAVAILABLE: { en: "Temporarily unavailable", fr: "Temporairement indisponible", hex: "#e0522f", ok: false },
  BLOCKED: { en: "Red zone — unavailable", fr: "Zone rouge — indisponible", hex: "#e0522f", ok: false },
};

/** Map a delivery ZoneTier (from confirmed coordinates) to a service status. */
export function tierToStatus(tier: ZoneTier | null): string {
  if (tier === "GREEN") return "PRIORITY";
  if (tier === "YELLOW") return "STANDARD";
  if (tier === "RED") return "REVIEW_REQUIRED";
  return "REVIEW_REQUIRED";
}

export const ARRONDISSEMENT_LABEL: Record<string, string> = {
  YAOUNDE_I: "Yaoundé I",
  YAOUNDE_II: "Yaoundé II",
  YAOUNDE_III: "Yaoundé III",
  YAOUNDE_IV: "Yaoundé IV",
  YAOUNDE_V: "Yaoundé V",
  YAOUNDE_VI: "Yaoundé VI",
  YAOUNDE_VII: "Yaoundé VII",
  YAOUNDE_PERIPHERY: "Yaoundé Periphery",
};
