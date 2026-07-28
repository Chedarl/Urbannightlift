import type { Metadata } from "next";
import { MerchantSignupForm } from "@/components/merchant/MerchantSignupForm";

export const metadata: Metadata = {
  title: "Sell with Urban Night Lift — Yaoundé night delivery",
  description:
    "Add your restaurant, supermarket, pharmacy or shop so customers can order from you between 6 PM and 4 AM in Yaoundé.",
};

/**
 * Public, no login. The link is meant to be sent over WhatsApp or dropped into
 * an Instagram DM, so it has to open straight into the form on a phone.
 */
export default function MerchantJoinPage() {
  return (
    <main>
      <MerchantSignupForm />
    </main>
  );
}
