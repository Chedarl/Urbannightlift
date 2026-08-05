import type { Metadata } from "next";

import { MerchantAvailability } from "@/components/merchant/MerchantAvailability";

export const dynamic = "force-dynamic";

/**
 * Never indexed. It is a link for one business, for one night, sent in a chat.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: "Ce que vous avez ce soir · Urban Night Lift",
};

export default async function MerchantPingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <MerchantAvailability token={token} />;
}
