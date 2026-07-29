import { prisma } from "@/lib/prisma";
import { RiderApplicationsManager } from "@/components/admin/RiderApplicationsManager";

export const dynamic = "force-dynamic";

/**
 * People asking to ride for us.
 *
 * ID card images are referenced by their private storage path only — the paths
 * are useless without the ADMIN_ROLES-gated media route that signs them, so
 * this page never puts a rider's identity document behind a guessable URL.
 */
export default async function RiderApplicationsPage() {
  const [applications, riders] = await Promise.all([
    prisma.riderApplication.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.user.findMany({
      where: { role: "RIDER", status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, idVerifiedAt: true },
    }),
  ]);

  const zones = await prisma.zone.findMany({ select: { id: true, zoneName: true } });
  const zoneName = new Map(zones.map((z) => [z.id, z.zoneName]));

  return (
    <RiderApplicationsManager
      riders={riders.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        idVerified: r.idVerifiedAt != null,
      }))}
      applications={applications.map((a) => ({
        id: a.id,
        fullName: a.fullName,
        whatsappNumber: a.whatsappNumber,
        phone: a.phone,
        email: a.email,
        neighbourhood: a.neighbourhood,
        zoneNames: a.zonePreference.map((z) => zoneName.get(z) ?? z),
        idCardNumber: a.idCardNumber,
        idCardFrontUrl: a.idCardFrontUrl,
        idCardBackUrl: a.idCardBackUrl,
        photoUrl: a.photoUrl,
        vehicleType: a.vehicleType,
        vehicleRef: a.vehicleRef,
        hasLicence: a.hasLicence,
        ownsVehicle: a.ownsVehicle,
        availability: a.availability,
        yearsExperience: a.yearsExperience,
        notes: a.notes,
        status: a.status,
        reviewNote: a.reviewNote,
        createdAt: a.createdAt.toISOString(),
      }))}
    />
  );
}
