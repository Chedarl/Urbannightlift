import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { OrderReview } from "@/components/customer/OrderReview";
import { OrderGate } from "@/components/customer/OrderGate";
import { getOperatingSettings } from "@/lib/settings";
import { getCustomerId } from "@/lib/auth/customer";
import { serverIsFrench } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function OrderReviewPage() {
  const [settings, customerId] = await Promise.all([getOperatingSettings(), getCustomerId()]);

  if (settings.requireAccountToOrder && !customerId) {
    return <OrderGate next="/order/review" fr={await serverIsFrench()} />;
  }

  return (
    <>
      <CustomerHeader />
      <main>
        <OrderReview />
      </main>
    </>
  );
}
