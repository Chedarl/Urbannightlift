import type { Metadata } from "next";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { HelpContent } from "@/components/customer/HelpContent";
import { BottomNav } from "@/components/customer/BottomNav";
import { getCustomerId } from "@/lib/auth/customer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Help Center — Urban Night Lift",
  description: "FAQs and support for Urban Night Lift night delivery across Yaoundé. Contact us by email, form, or WhatsApp.",
};

export default async function HelpPage() {
  const customerId = await getCustomerId();
  return (
    <>
      <CustomerHeader />
      <main>
        <HelpContent />
      </main>
      {/* Every other in-app screen keeps the bottom nav; Help used to drop it,
          stranding anyone who tapped the Help tab with no way to tab back. */}
      <BottomNav signedIn={Boolean(customerId)} />
    </>
  );
}
