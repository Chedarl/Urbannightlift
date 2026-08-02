import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { BottomNav } from "@/components/customer/BottomNav";
import { OrderGate } from "@/components/customer/OrderGate";
import { FoodForm } from "@/components/customer/order/forms/FoodForm";
import { getOperatingSettings } from "@/lib/settings";
import { getCustomerId } from "@/lib/auth/customer";
import { serverIsFrench } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ServiceSelectionPage() {
  const [settings, customerId] = await Promise.all([getOperatingSettings(), getCustomerId()]);

  if (settings.requireAccountToOrder && !customerId) {
    return <OrderGate next="/order" fr={await serverIsFrench()} />;
  }

  return (
    <>
      <CustomerHeader />
      <main>
        <FoodForm />
      </main>
      <BottomNav signedIn={Boolean(customerId)} />
    </>
  );
}
