"use client";

/**
 * Telling whether we are running inside the native app.
 *
 * The same site serves three surfaces now — a browser, an installed PWA, and a
 * Capacitor shell on the stores — and a few things must differ between them.
 * Most obviously: the "Install app" button is nonsense inside an app somebody
 * already installed, and push has to go through the OS rather than the Push API,
 * which Android's WebView does not implement.
 *
 * Deliberately dependency-free. The web app does not import `@capacitor/core`;
 * it reads the global the shell injects. Adding a Capacitor dependency to the
 * website's bundle to answer a yes/no question would be a poor trade, and it
 * would mean the site could not be built without the mobile toolchain present.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
}

function cap(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}

/** True only inside the Android or iOS shell — never in a browser or a PWA. */
export function isNativeApp(): boolean {
  return cap()?.isNativePlatform?.() === true;
}

export type NativePlatform = "ios" | "android" | "web";

export function nativePlatform(): NativePlatform {
  const platform = cap()?.getPlatform?.();
  return platform === "ios" || platform === "android" ? platform : "web";
}

/**
 * Whether this device is running the app as an app at all — installed PWA or
 * native shell.
 *
 * Used for the install prompt, which should disappear in both cases. A customer
 * who has already added us to their home screen being told to add us to their
 * home screen is the kind of small wrongness that makes a product feel
 * unattended.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeApp()) return true;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return window.matchMedia?.("(display-mode: standalone)").matches === true || iosStandalone === true;
}
