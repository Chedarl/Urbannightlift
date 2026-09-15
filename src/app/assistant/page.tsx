import type { Metadata } from "next";

import { AssistantPage } from "@/components/customer/AssistantPage";
import { BottomNav } from "@/components/customer/BottomNav";
import { getCustomerId } from "@/lib/auth/customer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ask Urban Night Lift",
  description:
    "Ask about tonight's hours, what a delivery costs, which pharmacies are on duty, or where your order has got to.",
};

/**
 * The assistant, given a room of its own.
 *
 * It already existed as a bubble in the bottom-right corner — a sheet you open,
 * ask one thing, and dismiss. That shape says "help widget", and people used it
 * like one: a handful of conversations in a month.
 *
 * The thing it can actually do is larger than the shape it was in. It reads
 * tonight's real state — hours, open merchants, duty pharmacies, the asker's own
 * orders and saved addresses — and it can hand back working buttons: track this,
 * order that again, deliver to your usual place, start a service, reach a
 * person. That is not a help widget. It is the fastest way through the product
 * for somebody who knows what they want and does not want to hunt for it.
 *
 * So it gets a page and a tab: the conversation persists, what it can do is
 * stated rather than discovered, and there is room for the answer to be more
 * than two lines. The corner bubble stays on every other screen, because a
 * question that occurs to you mid-order should not cost you the order — and it
 * hides itself here, since a button that opens the assistant, floating on top
 * of the assistant, is one affordance too many.
 */
export default async function Page() {
  const customerId = await getCustomerId();
  return (
    <>
      <AssistantPage />
      <BottomNav signedIn={Boolean(customerId)} />
    </>
  );
}
