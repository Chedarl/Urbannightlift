import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { TrackForm } from "@/components/customer/TrackForm";

export const dynamic = "force-dynamic";

export default function TrackPage() {
  return (
    <>
      <CustomerHeader />
      <main>
        <TrackForm />
      </main>
    </>
  );
}
