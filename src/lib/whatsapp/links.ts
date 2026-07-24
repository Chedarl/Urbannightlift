/** wa.me deep links — the MVP's only WhatsApp integration (no Business API). */

// All communication routes to a single number.
export const MAIN_WHATSAPP_NUMBER = "237680038004"; // +237 680 038 004
export const ADMIN_WHATSAPP_NUMBER = "237680038004"; // +237 680 038 004

export function buildWaLink(number: string, message: string): string {
  const digits = number.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
