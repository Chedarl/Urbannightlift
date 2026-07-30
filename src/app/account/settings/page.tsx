import { redirect } from "next/navigation";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { BottomNav } from "@/components/customer/BottomNav";
import { SettingsScreen } from "@/components/customer/portal/SettingsScreen";
import { getCustomerId } from "@/lib/auth/customer";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  if (!(await getCustomerId())) redirect("/account/login?next=/account/settings");
  return (
    <>
      <CustomerHeader />
      <main>
        <SettingsScreen />
      </main>
      <BottomNav signedIn />
    </>
  );
}
