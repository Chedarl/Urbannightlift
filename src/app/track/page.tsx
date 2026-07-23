import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { TrackForm } from "@/components/customer/TrackForm";
import { BottomNav } from "@/components/customer/BottomNav";

export const dynamic = "force-dynamic";

export default function TrackPage() {
  return (
    <>
      <CustomerHeader />
      <main>
        <TrackForm />
      </main>
      <BottomNav />
    </>
  );
}
