import Link from "next/link";
import { Inbox } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ServiceWaitingList } from "@/components/admin/ServiceWaitingList";
import { getOperatingSettings, resolveEnabledServices } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Cases moved into the Customer service inbox, where they sit beside the live
 * board and each customer's history — one desk instead of three screens. What
 * stays here is the waiting list: the demand signal for services not yet live.
 */
export default async function SupportPage() {
  const [waiting, settings] = await Promise.all([
    prisma.serviceInterest.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    getOperatingSettings(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/live"
        className="flex items-center gap-3 rounded-2xl border border-violet-500/30 bg-violet-950/20 p-4 hover:border-violet-500/50"
      >
        <Inbox className="h-5 w-5 text-violet-300" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-mist-100">Support cases now live in Customer service</span>
          <span className="block text-xs text-mist-400">
            Every case, sorted by who has waited longest, beside the live board and the customer 360. Open the desk →
          </span>
        </span>
      </Link>

      <ServiceWaitingList
        enabledServices={resolveEnabledServices(settings)}
        entries={waiting.map((w) => ({
          id: w.id,
          serviceType: w.serviceType,
          whatsappNumber: w.whatsappNumber,
          createdAt: w.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
