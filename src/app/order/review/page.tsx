import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { OrderReview } from "@/components/customer/OrderReview";
import { getOperatingSettings } from "@/lib/settings";
import { getCustomerId } from "@/lib/auth/customer";
import { prisma } from "@/lib/prisma";
import { eligibleForLaunchOffer } from "@/lib/orders/launchOffer";

export const dynamic = "force-dynamic";

/**
 * The review screen, which is now also the door.
 *
 * It used to return `<OrderGate>` in place of the whole page for anyone not
 * signed in — so a customer who had just filled in an entire order could not
 * see their own summary, their own address, or the price, until they had chosen
 * a PIN. That is the most expensive possible moment to ask: they have done all
 * the work and have not yet been told what it costs.
 *
 * The gate did not go away; it moved to the one control it belongs on. The
 * screen renders, the price is visible, and "Place order" is what asks for an
 * account — at which point the three things an account buys (your orders in one
 * place, your addresses remembered, a link that lets somebody watch you home)
 * are about to become true rather than being promises made to a stranger.
 */
export default async function OrderReviewPage() {
  const [settings, customerId] = await Promise.all([getOperatingSettings(), getCustomerId()]);

  /*
    Whether this person's first delivery is on us — decided here rather than on
    the client, because "have you ordered before" is a fact about the database
    and a browser must never be the one to answer it.
  */
  const completedOrders = customerId
    ? await prisma.order.count({ where: { customerId, orderStatus: "DELIVERED" } })
    : 0;
  const capXaf = settings.firstOrderFreeCapXaf ?? 0;

  return (
    <>
      <CustomerHeader />
      <main>
        <OrderReview
          signedIn={Boolean(customerId)}
          accountRequired={settings.requireAccountToOrder}
          firstOrderFreeCapXaf={eligibleForLaunchOffer(completedOrders, capXaf) ? capXaf : 0}
        />
      </main>
      {/* No nav: `CheckoutBar` owns the bottom of this screen, and two pinned
          bars is one too many. "Edit order" is the way back. */}
    </>
  );
}
