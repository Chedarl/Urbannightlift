/**
 * Google Plus Codes (Open Location Code) — encode/decode a lat/lng to a short
 * code, and recognize a pasted code. Pure client-side, no API key required.
 */
import { OpenLocationCode } from "open-location-code";

const olc = new OpenLocationCode();

/** Full plus code for a point (e.g. "6FMHRFRR+RR"). */
export function encodePlusCode(lat: number, lng: number): string {
  try {
    return olc.encode(lat, lng, 10);
  } catch {
    return "";
  }
}

/** Whether a string is a valid full Open Location Code. */
export function isPlusCode(value: string): boolean {
  try {
    return olc.isValid(value.trim()) && olc.isFull(value.trim());
  } catch {
    return false;
  }
}

/** Decode a full plus code to its centre point, or null. */
export function decodePlusCode(code: string): { lat: number; lng: number } | null {
  try {
    const t = code.trim();
    if (!olc.isValid(t) || !olc.isFull(t)) return null;
    const d = olc.decode(t);
    return { lat: d.latitudeCenter, lng: d.longitudeCenter };
  } catch {
    return null;
  }
}
