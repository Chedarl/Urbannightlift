import { redirect } from "next/navigation";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { AccountAuthForm } from "@/components/customer/account/AccountAuthForm";
import { getCustomerId } from "@/lib/auth/customer";

export const dynamic = "force-dynamic";

export default async function AccountSignupPage() {
  if (await getCustomerId()) redirect("/account");
  return (
    <>
      <CustomerHeader />
      <main>
        <AccountAuthForm mode="signup" />
      </main>
    </>
  );
}
