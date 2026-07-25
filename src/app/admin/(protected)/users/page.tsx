import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { UsersManager } from "@/components/admin/UsersManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const owner = await requireRole(["OWNER"]);
  if (!owner) redirect("/admin/dashboard");

  const [users, zones] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.zone.findMany({
      where: { active: true },
      select: { id: true, zoneName: true },
      orderBy: { zoneName: "asc" },
    }),
  ]);
  return (
    <UsersManager
      currentUserId={owner.id}
      zones={zones}
      users={users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        role: u.role,
        status: u.status,
        zoneIds: u.zoneIds,
        isOnline: u.isOnline,
      }))}
    />
  );
}
