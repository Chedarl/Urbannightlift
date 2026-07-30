"use client";

import { useState } from "react";
import { Radio, Users2, Inbox, Store, BarChart3 } from "lucide-react";
import { LiveConsole } from "@/components/admin/LiveConsole";
import { CustomerCrm } from "@/components/admin/CustomerCrm";
import { CaseInbox } from "@/components/admin/CaseInbox";
import { MerchantRelations } from "@/components/admin/MerchantRelations";
import { CrmInsights } from "@/components/admin/CrmInsights";
import { cn } from "@/lib/utils";

/**
 * The relationship desk — one place for support and customer experience.
 *
 * "Inbox" is what someone must answer: every case, worst-first, with the whole
 * conversation and the means to close it. "Happening now" is what is moving:
 * every live order and the fleet on a map. "Customers" is who it is happening
 * to: search anyone, then their whole history in one thread.
 *
 * Tabs rather than pages because a support call crosses all three at once —
 * somebody messages about the order you are already watching.
 */
type Tab = "INBOX" | "NOW" | "PEOPLE" | "MERCHANTS" | "INSIGHTS";

export function ServiceDesk({ canBlock }: { canBlock: boolean }) {
  const [tab, setTab] = useState<Tab>("INBOX");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl font-bold">Customer service</h1>
        <p className="mt-1 text-sm text-mist-400">
          Answer what is waiting, watch what is moving, and know who it is happening to.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-ink-800 bg-ink-950 p-1">
        <TabButton active={tab === "INBOX"} onClick={() => setTab("INBOX")} icon={<Inbox className="h-4 w-4" />}>
          Inbox
        </TabButton>
        <TabButton active={tab === "NOW"} onClick={() => setTab("NOW")} icon={<Radio className="h-4 w-4" />}>
          Now
        </TabButton>
        <TabButton active={tab === "PEOPLE"} onClick={() => setTab("PEOPLE")} icon={<Users2 className="h-4 w-4" />}>
          Customers
        </TabButton>
        <TabButton active={tab === "MERCHANTS"} onClick={() => setTab("MERCHANTS")} icon={<Store className="h-4 w-4" />}>
          Merchants
        </TabButton>
        <TabButton active={tab === "INSIGHTS"} onClick={() => setTab("INSIGHTS")} icon={<BarChart3 className="h-4 w-4" />}>
          Insights
        </TabButton>
      </div>

      {tab === "INBOX" ? (
        <CaseInbox />
      ) : tab === "NOW" ? (
        <LiveConsole />
      ) : tab === "PEOPLE" ? (
        <CustomerCrm canBlock={canBlock} />
      ) : tab === "MERCHANTS" ? (
        <MerchantRelations />
      ) : (
        <CrmInsights />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
        active ? "bg-violet-500/15 text-violet-200" : "text-mist-500 hover:text-mist-300"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
