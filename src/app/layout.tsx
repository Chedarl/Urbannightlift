import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import { LanguageProvider, LOCALE_COOKIE, type Locale } from "@/lib/i18n";
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
  title: "Urban Night Lift — Night delivery in Yaoundé 6",
  description:
    "Safe night pickup and delivery of food, medicine, groceries, urgent items, and approved errands within Yaoundé 6. 8:00 PM to midnight.",
  manifest: "/manifest.json",
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
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
