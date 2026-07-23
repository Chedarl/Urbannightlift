import { redirect } from "next/navigation";
import { requireRole, ADMIN_ROLES } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(ADMIN_ROLES);
  if (!user) redirect("/admin/login");

  return (
    <AdminShell role={user.role} userName={user.fullName}>
      {children}
    </AdminShell>
  );
}
