import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { RiderProfileForm } from "@/components/rider/RiderProfileForm";

export const dynamic = "force-dynamic";

export default async function RiderProfilePage() {
  const user = await getSessionUser();
  if (!user || user.role !== "RIDER") redirect("/rider/login");

  const rider = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      fullName: true,
      phone: true,
      photoUrl: true,
      vehicleRef: true,
      idCardNumber: true,
      idCardFrontUrl: true,
      idCardBackUrl: true,
      idVerifiedAt: true,
    },
  });
  if (!rider) redirect("/rider/login");

  return (
    <RiderProfileForm
      profile={{ ...rider, idVerifiedAt: rider.idVerifiedAt?.toISOString() ?? null }}
    />
  );
}
