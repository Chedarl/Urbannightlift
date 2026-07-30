import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentMerchant } from "@/lib/auth/merchant";
import { MerchantAuthForm } from "@/components/merchant/MerchantAuthForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Merchant sign in — Urban Night Lift",
  description: "Manage your shop's orders, prices and opening hours on Urban Night Lift.",
  robots: { index: false },
};

export default async function MerchantLoginPage() {
  // Already signed in: send them where they were going rather than showing a
  // login form they do not need.
  if (await getCurrentMerchant()) redirect("/merchant");
  return (
    <Suspense>
      <MerchantAuthForm />
    </Suspense>
  );
}
