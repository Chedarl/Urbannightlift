"use client";

import { useState } from "react";
import { Radio, Users2 } from "lucide-react";
import { LiveConsole } from "@/components/admin/LiveConsole";
import { CustomerCrm } from "@/components/admin/CustomerCrm";
import { cn } from "@/lib/utils";

/**
 * The support desk, in the two states it is ever in.
 *
 * "Now" is what is moving: every live order worst-first, the fleet on a map,
 * and both phone numbers on every row. "Customers" is who it is happening to:
 * search anyone, then their whole history — orders, complaints, notes and money
 * — in a single thread, with everything a call can end in on the same panel.
 *
 * They are tabs rather than two pages because a support call moves between them
 * constantly: somebody rings about the order you are already watching.
 */
export function ServiceDesk({ canBlock }: { canBlock: boolean }) {
  const [tab, setTab] = useState<"NOW" | "PEOPLE">("NOW");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl font-bold">Customer service</h1>
        <p className="mt-1 text-sm text-mist-400">
          Notice something and call about it before the customer calls us.
        </p>
      </div>

      <div className="flex gap-1 rounded-xl border border-ink-800 bg-ink-950 p-1">
        <Tab active={tab === "NOW"} onClick={() => setTab("NOW")} icon={<Radio className="h-4 w-4" />}>
          Happening now
        </Tab>
        <Tab active={tab === "PEOPLE"} onClick={() => setTab("PEOPLE")} icon={<Users2 className="h-4 w-4" />}>
          Customers
        </Tab>
      </div>

      {tab === "NOW" ? <LiveConsole /> : <CustomerCrm canBlock={canBlock} />}
    </div>
  );
}

function Tab({
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
