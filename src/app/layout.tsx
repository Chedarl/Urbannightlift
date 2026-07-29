import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import { LanguageProvider, LOCALE_COOKIE, type Locale } from "@/lib/i18n";
import { ServiceWorkerRegister } from "@/components/shared/ServiceWorkerRegister";
import { OrganizationSchema } from "@/components/shared/OrganizationSchema";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://urbannighlift.com"),
  title: "Urban Night Lift — Night delivery in Yaoundé",
  description:
    "Safe night pickup and delivery of food, medicine, groceries, urgent items, and approved errands across Yaoundé. 6:00 PM to 4:00 AM.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Urban Night Lift",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    title: "Urban Night Lift — Night delivery in Yaoundé",
    description: "Your city. Our ride. Night delivered — across Yaoundé, 6 PM to 4 AM.",
    url: "https://urbannighlift.com",
    siteName: "Urban Night Lift",
    locale: "en",
    type: "website",
  },
  /**
   * Google Search Console ownership.
   *
   * Read from an environment variable rather than hardcoded so the owner can
   * verify the domain themselves — set GOOGLE_SITE_VERIFICATION in Vercel to
   * the token Search Console gives you and redeploy. Nothing renders until it
   * is set, so an unset variable is harmless.
   *
   * This is the "HTML tag" method, which is far easier than the DNS TXT record
   * for a domain on Vercel's nameservers, and it is what lets us request a
   * Safe Browsing review.
   */
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = {
  themeColor: "#0a0710",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale = cookieLocale === "fr" ? "fr" : "en";

  return (
    <html lang={locale}>
      <body className={`${inter.variable} ${spaceGrotesk.variable} antialiased`}>
        <OrganizationSchema />
        <ServiceWorkerRegister />
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
