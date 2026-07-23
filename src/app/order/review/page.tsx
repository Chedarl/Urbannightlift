import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { OrderReview } from "@/components/customer/OrderReview";

export const dynamic = "force-dynamic";

export default function OrderReviewPage() {
  return (
    <>
      <CustomerHeader />
      <main>
        <OrderReview />
      </main>
    </>
  );
}
