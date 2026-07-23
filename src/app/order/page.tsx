import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { ServiceSelection } from "@/components/customer/ServiceSelection";

export const dynamic = "force-dynamic";

export default function ServiceSelectionPage() {
  return (
    <>
      <CustomerHeader />
      <main>
        <ServiceSelection />
      </main>
    </>
  );
}
