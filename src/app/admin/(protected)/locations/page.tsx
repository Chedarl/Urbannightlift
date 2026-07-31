import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/session";
import { LocationsManager } from "@/components/admin/LocationsManager";

export const dynamic = "force-dynamic";

/**
 * The address book.
 *
 * Everything on this screen is read through the API rather than rendered from
 * the server, because the failing-address queue changes as orders come in and
 * dispatch will keep it open. Gated to `ADMIN_ROLES` like every other
 * back-office screen.
 */
export default async function LocationsPage() {
  const user = await requireRole(ADMIN_ROLES);
  if (!user) redirect("/admin/login");
  return <LocationsManager />;
}
