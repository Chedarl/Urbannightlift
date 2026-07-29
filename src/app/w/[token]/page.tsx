import type { Metadata } from "next";
import { WatchDelivery } from "@/components/customer/WatchDelivery";

export const dynamic = "force-dynamic";

/**
 * A watch link must never be indexed. It is meant for one person in a chat, not
 * for a search engine that will still be serving it long after it expires.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: "Watching a delivery · Urban Night Lift",
};

export default async function WatchPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <WatchDelivery token={token} />;
}
