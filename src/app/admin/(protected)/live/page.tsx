import { redirect } from "next/navigation";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/session";
import { ServiceDesk } from "@/components/admin/ServiceDesk";

export const dynamic = "force-dynamic";

/**
 * Customer service.
 *
 * Two halves, because a support desk does two different jobs: watching what is
 * happening right now, and knowing who it is happening to. Neither existed —
 * dispatch could see a list of orders and a list of names, and had to hold the
 * connection between them in their head at 1 AM.
 */
export default async function ServiceDeskPage() {
  const user = await requireRole(ADMIN_ROLES);
  if (!user) redirect("/admin/login");
  return <ServiceDesk canBlock={user.role === "OWNER"} />;
}
