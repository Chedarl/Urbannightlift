import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { TrackForm } from "@/components/customer/TrackForm";
import { BottomNav } from "@/components/customer/BottomNav";
import { getCustomerId } from "@/lib/auth/customer";

export const dynamic = "force-dynamic";

export default async function TrackPage() {
  const customerId = await getCustomerId();
  return (
    <>
      <CustomerHeader />
      <main>
        <TrackForm />
      </main>
      <BottomNav signedIn={Boolean(customerId)} />
    </>
  );
}
