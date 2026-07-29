import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/lib/i18n";

/**
 * The visitor's language, read server-side from the same cookie the client
 * writes. Server components need this to render the right words before any
 * client code runs — the order gate and the portal shell both do.
 */
export async function serverIsFrench(): Promise<boolean> {
  const store = await cookies();
  return store.get(LOCALE_COOKIE)?.value === "fr";
}
