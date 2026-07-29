import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

/**
 * The brand ambassador programme is switched off.
 *
 * It was built as a second referral scheme wearing an ambassador's name —
 * self-signup, a code, a commission — which is not what a brand ambassador is.
 * Referrals now live with customers, where they belong, and this comes back
 * when it has been rebuilt as marketing: people we select, brief, give assets
 * to, and measure on reach rather than on their own orders.
 */
export async function ambassadorProgrammeOn(): Promise<boolean> {
  const s = await prisma.operatingSettings.findUnique({
    where: { id: 1 },
    select: { ambassadorProgrammeEnabled: true },
  });
  return s?.ambassadorProgrammeEnabled ?? false;
}

/** Sends a visitor away unless the owner has switched the programme on. */
export async function requireAmbassadorProgramme(): Promise<void> {
  if (!(await ambassadorProgrammeOn())) redirect("/");
}
