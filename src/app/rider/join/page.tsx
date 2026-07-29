import { prisma } from "@/lib/prisma";
import { RiderJoinForm } from "@/components/rider/RiderJoinForm";
import { JoinGate } from "@/components/shared/JoinGate";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Ride with us — Urban Night Lift",
  description: "Night delivery work in Yaoundé, 6 PM to 4 AM. Riders keep 60% of every fee.",
};

export default async function RiderJoinPage() {
  const zones = await prisma.zone.findMany({
    where: { active: true },
    orderBy: { zoneName: "asc" },
    select: { id: true, zoneName: true },
  });

  return (
    <JoinGate
      accent="#c084fc"
      fr={false}
      title="Ride with us"
      blurb="Night work in Yaoundé, 6 PM to 4 AM. Riders keep 60% of every fee."
    >
      <RiderJoinForm zones={zones} fr={false} />
    </JoinGate>
  );
}
