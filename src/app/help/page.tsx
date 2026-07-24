import type { Metadata } from "next";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { HelpContent } from "@/components/customer/HelpContent";

export const metadata: Metadata = {
  title: "Help Center — Urban Night Lift",
  description: "FAQs and support for Urban Night Lift night delivery across Yaoundé. Contact us by email, form, or WhatsApp.",
};

export default function HelpPage() {
  return (
    <>
      <CustomerHeader />
      <main>
        <HelpContent />
      </main>
    </>
  );
}
