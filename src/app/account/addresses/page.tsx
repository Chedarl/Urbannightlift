import { redirect } from "next/navigation";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { BottomNav } from "@/components/customer/BottomNav";
import { AddressManager } from "@/components/customer/portal/AddressManager";
import { getCustomerId } from "@/lib/auth/customer";

export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  if (!(await getCustomerId())) redirect("/account/login?next=/account/addresses");
  return (
    <>
      <CustomerHeader />
      <main>
        <AddressManager />
      </main>
      <BottomNav />
    </>
  );
}
