"use client";

import { useEffect, useState } from "react";
import { Clock, Star, AlertTriangle, CheckCircle2, ShieldAlert, Store, HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Whether the desk is winning.
 *
 * Three honest questions: are we answering people in time, are they happy, and
 * is the relationship base healthy? Every number here is computed from what we
 * actually record — no vanity metric that cannot be acted on.
 */
interface Insights {
  cases: { open: number; breached: number; resolved7d: number; avgFirstResponseMin: number | null };
  satisfaction: { csat: number | null; ratings30d: number; fiveStar: number; lowStar: number };
  relationships: { customersWithOpenCase: number; blockedCustomers: number; staleMerchants: number };
}

export function CrmInsights() {
  const [data, setData] = useState<Insights | null>(null);

  useEffect(() => {
    fetch("/api/admin/insights", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return <p className="rounded-2xl border border-ink-800 bg-ink-900 p-6 text-sm text-mist-400">Loading insights…</p>;

  const fmtMin = (m: number | null) => (m == null ? "—" : m < 60 ? `${m} min` : `${Math.round((m / 60) * 10) / 10} h`);

  return (
    <div className="flex flex-col gap-5">
      <Section title="Are we answering in time?" icon={<Clock className="h-4 w-4" />}>
        <Card label="Open cases" value={String(data.cases.open)} />
        <Card label="Overdue now" value={String(data.cases.breached)} tone={data.cases.breached > 0 ? "bad" : "good"} icon={data.cases.breached > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : undefined} />
        <Card label="Avg first reply" value={fmtMin(data.cases.avgFirstResponseMin)} sub="last 7 days" />
        <Card label="Resolved" value={String(data.cases.resolved7d)} sub="last 7 days" tone="good" icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
      </Section>

      <Section title="Are they happy?" icon={<Star className="h-4 w-4" />}>
        <Card label="Satisfaction" value={data.satisfaction.csat == null ? "—" : `${data.satisfaction.csat}★`} sub={`${data.satisfaction.ratings30d} rated · 30d`} tone={data.satisfaction.csat != null && data.satisfaction.csat >= 4 ? "good" : data.satisfaction.csat != null && data.satisfaction.csat < 3 ? "bad" : "plain"} />
        <Card label="5-star" value={String(data.satisfaction.fiveStar)} sub="last 30 days" tone="good" />
        <Card label="1–2 star" value={String(data.satisfaction.lowStar)} sub="last 30 days" tone={data.satisfaction.lowStar > 0 ? "bad" : "plain"} />
      </Section>

      <Section title="Is the base healthy?" icon={<HeartPulse className="h-4 w-4" />}>
        <Card label="Customers with an open case" value={String(data.relationships.customersWithOpenCase)} />
        <Card label="On the do-not-serve list" value={String(data.relationships.blockedCustomers)} icon={<ShieldAlert className="h-3.5 w-3.5" />} />
        <Card label="Merchants to reconfirm" value={String(data.relationships.staleMerchants)} sub="60+ days" icon={<Store className="h-3.5 w-3.5" />} tone={data.relationships.staleMerchants > 0 ? "watch" : "plain"} />
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 font-display text-sm font-semibold text-mist-200">
        {icon} {title}
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
    </section>
  );
}

function Card({
  label,
  value,
  sub,
  tone = "plain",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "plain" | "good" | "bad" | "watch";
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        tone === "bad" && "border-restricted/40 bg-restricted/[0.05]",
        tone === "good" && "border-safe/30 bg-safe/[0.04]",
        tone === "watch" && "border-caution/40 bg-caution/[0.05]",
        tone === "plain" && "border-ink-800 bg-ink-900"
      )}
    >
      <p className={cn("flex items-center gap-1 font-display text-2xl font-bold tabular-nums", tone === "bad" ? "text-restricted" : tone === "good" ? "text-safe" : tone === "watch" ? "text-caution" : "text-mist-100")}>
        {icon}
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-mist-500">{label}</p>
      {sub && <p className="text-[10px] text-mist-600">{sub}</p>}
    </div>
  );
}
