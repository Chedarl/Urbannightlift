import { redirect } from "next/navigation";
import { HomeContent } from "@/components/customer/HomeContent";
import { getOperatingSettings, resolveEnabledServices } from "@/lib/settings";
import { getCustomerId } from "@/lib/auth/customer";

export const dynamic = "force-dynamic";

/**
 * The Search Console ownership tag lives on the homepage rather than in the
 * root layout, because that is the URL Google fetches to verify and it keeps
 * the settings read off every other page.
 *
 * The token comes from settings first and the environment second. A Vercel
 * environment variable only takes effect on the next build, so setting one and
 * pressing "Verify" fails with nothing on screen explaining why — which is
 * exactly what happened. From Admin → Settings it is live immediately.
 */
export async function generateMetadata() {
  const settings = await getOperatingSettings();
  const token = settings.googleSiteVerification?.trim() || process.env.GOOGLE_SITE_VERIFICATION?.trim();
  return token ? { verification: { google: token } } : {};
}

export default async function HomePage() {
  const [settings, customerId] = await Promise.all([getOperatingSettings(), getCustomerId()]);
  // One home. A signed-in customer opening the site root lands in their portal,
  // never on the marketing page — the same way Uber and Yango open straight
  // into the app. This is what stops the logo and every "/" link from ejecting
  // a logged-in customer out of the app onto a brochure. The marketing page
  // stays exactly as it is for logged-out visitors and search engines.
  if (customerId) redirect("/account");
  return (
    <main>
      <HomeContent
        mode={settings.mode}
        startHour={settings.operatingStartHour}
        endHour={settings.operatingEndHour}
        enabledServices={resolveEnabledServices(settings)}
        signedIn={false}
      />
    </main>
  );
}
