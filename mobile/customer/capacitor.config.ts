import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The customer app: a native shell around urbannighlift.com.
 *
 * ## Why `server.url` rather than a bundled build
 *
 * The site is server-rendered — App Router, Prisma, per-request data on nearly
 * every route — so there is no static export to bundle into the app. Pointing
 * the shell at the live site is therefore not a shortcut but the only correct
 * option, and it brings a real advantage: **a fix ships to the app the moment it
 * ships to the web**, with no store review in between. For a business that
 * trades 6 PM to 4 AM, waiting two days for Apple to approve a bug fix is not an
 * acceptable failure mode.
 *
 * The trade-off is honest: with no network there is no app. `www/index.html` is
 * the offline screen that says so in both languages, rather than a white page.
 *
 * ## What makes this an app rather than a bookmark
 *
 * Apple's guideline 4.2 rejects apps that are only a website in a frame, and
 * they are right to. What this adds:
 *  - **Native push**, so an order update reaches an iPhone without the customer
 *    having first done Share → Add to Home Screen. That is the single biggest
 *    gap in the PWA today.
 *  - A real splash screen, status bar, and Android hardware-back handling.
 *  - Offline detection with a screen that explains itself.
 *  - Haptics on the actions that matter.
 *
 * The rider app is deliberately **not** this. It is a separate, genuinely native
 * app (`mobile/rider`), because background location cannot be done in a WebView
 * and background location is the whole reason riders need an app at all.
 */
const config: CapacitorConfig = {
  appId: "com.urbannightlift.customer",
  appName: "Urban Night Lift",
  // Only the offline fallback lives here; everything real comes from the server.
  webDir: "www",

  server: {
    url: "https://urbannighlift.com",
    // The domain is the brand and the only host we ever publish. The middleware
    // already 308s any *.vercel.app request here, so a stale build URL inside the
    // app would still land on the right place.
    hostname: "urbannighlift.com",
    androidScheme: "https",
    iosScheme: "https",
    // Nothing but our own site loads in the shell. External links are opened in
    // the system browser by `@capacitor/browser` instead, so a link in a
    // merchant's page can never render inside our chrome pretending to be us.
    allowNavigation: ["urbannighlift.com", "*.urbannighlift.com"],
  },

  android: {
    // Plain http is never used, so leave it refused rather than allowed.
    allowMixedContent: false,
    captureInput: true,
  },

  ios: {
    // The app is dark; a light scroll bounce flashing white looks broken.
    backgroundColor: "#0a0710",
    contentInset: "always",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      // The site paints its own first screen; holding the splash past that just
      // makes the app feel slower than the browser.
      launchAutoHide: true,
      backgroundColor: "#0a0710",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0710",
    },
    PushNotifications: {
      // Sound and badge only. The banner is drawn by the OS.
      presentationOptions: ["alert", "badge", "sound"],
    },
    Keyboard: {
      resize: "native",
    },
  },
};

export default config;
