import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { RiderShell } from "@/components/rider/RiderShell";

export const dynamic = "force-dynamic";

export default async function ProtectedRiderLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["RIDER"]);
  if (!user) redirect("/rider/login");

  return <RiderShell userName={user.fullName}>{children}</RiderShell>;
}
