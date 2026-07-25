"use client";

import { useState } from "react";
import { BellRing, MessageCircle, ChevronDown } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Badge } from "@/components/shared/Badge";
import { buildWaLink } from "@/lib/whatsapp/links";
import type { ServiceType } from "@prisma/client";

export interface WaitingEntry {
  id: string;
  serviceType: ServiceType;
  whatsappNumber: string;
  createdAt: string;
}

/**
 * Who is waiting for each paused service. This is the demand signal behind the
 * decision to switch a service on, and the list to message when it launches.
 */
export function ServiceWaitingList({
  entries,
  enabledServices,
}: {
  entries: WaitingEntry[];
  enabledServices: ServiceType[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<ServiceType | null>(null);

  const byService = new Map<ServiceType, WaitingEntry[]>();
  for (const e of entries) {
    const list = byService.get(e.serviceType) ?? [];
    list.push(e);
    byService.set(e.serviceType, list);
  }
  // Busiest waiting list first — that's the service worth launching next.
  const groups = [...byService.entries()].sort((a, b) => b[1].length - a[1].length);

  if (groups.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-lg font-bold">Service waiting list</h2>
        <p className="text-xs text-mist-400">
          Customers who asked to be told when a paused service launches. The longest list is the
          strongest demand signal.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {groups.map(([svc, list]) => {
          const isOpen = open === svc;
          const live = enabledServices.includes(svc);
          return (
            <div key={svc} className="rounded-2xl border border-ink-700 bg-ink-900">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : svc)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <BellRing className="h-4 w-4 shrink-0 text-gold-300" />
                  <span className="truncate text-sm font-semibold text-mist-100">
                    {t(`services.${svc}.name`)}
                  </span>
                  {live && <Badge tone="safe">Live</Badge>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone="caution">{list.length} waiting</Badge>
                  <ChevronDown
                    className={`h-4 w-4 text-mist-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </span>
              </button>

              {isOpen && (
                <ul className="flex flex-col gap-1.5 border-t border-ink-700 p-3">
                  {list.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-mist-300">{e.whatsappNumber}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-mist-500">
                          {new Date(e.createdAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </span>
                        <a
                          href={buildWaLink(
                            e.whatsappNumber,
                            `Urban Night Lift — ${t(`services.${svc}.name`)} is now available!`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-[#25D366] px-2 py-1 font-semibold text-ink-950"
                        >
                          <MessageCircle className="h-3 w-3" /> Notify
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
