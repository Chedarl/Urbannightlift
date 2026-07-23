import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalize a phone number to digits-only international form (no leading +). */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/[^\d]/g, "");
  // Local Cameroon format (6XXXXXXXX) -> prefix country code
  if (digits.length === 9 && digits.startsWith("6")) digits = `237${digits}`;
  return digits;
}

export function formatXaf(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `${amount.toLocaleString("fr-FR")} XAF`;
}
