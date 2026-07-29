import { redirect } from "next/navigation";
import { AccountAuthForm } from "@/components/customer/account/AccountAuthForm";
import { getCustomerId } from "@/lib/auth/customer";

export const dynamic = "force-dynamic";

export default async function AccountLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await getCustomerId()) {
    redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/account");
  }
  return (
    <main>
      <AccountAuthForm mode="login" />
    </main>
  );
}
