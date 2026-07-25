"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { OperatingModeControls } from "@/components/admin/OperatingModeControls";
import { NeedsAttention, type AttentionRow } from "@/components/admin/NeedsAttention";
import { EnableNotifications } from "@/components/shared/EnableNotifications";
import { formatXaf, cn } from "@/lib/utils";
import type { OperatingMode } from "@prisma/client";

export interface DashboardStatsData {
  total: number;
  pendingReview: number;
  awaitingPayment: number;
  assigned: number;
  inProgress: number;
  delivered: number;
  cancelled: number;
  revenue: number;
  riderActive: boolean;
  riderName: string;
}

function Stat({
  label,
  value,
  highlight,
  href,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
  href?: string;
}) {
  const inner = (
    <div
      className={cn(
        "rounded-2xl border p-4",
        highlight ? "border-gold-400/40 bg-gold-400/5" : "border-ink-700 bg-ink-900",
        href && "transition-colors hover:border-violet-500"
      )}
    >
      <p className="text-xs text-mist-500">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-bold", highlight ? "text-gold-400" : "text-mist-100")}>
        {value}
      </p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function DashboardStats({
  stats,
  mode,
  attention,
}: {
  stats: DashboardStatsData;
  mode: OperatingMode;
  attention: AttentionRow[];
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">{t("admin.dashboard.title")}</h1>
        <div className="flex items-center gap-3">
          <EnableNotifications />
          <Link
            href="/admin/orders"
            className="flex items-center gap-1 text-sm font-medium text-violet-300 hover:text-violet-500"
          >
            {t("admin.dashboard.viewAllOrders")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Above the stats on purpose: what is stuck matters more than what has
          already gone right. */}
      <NeedsAttention rows={attention} />

      <OperatingModeControls mode={mode} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label={t("admin.dashboard.totalOrders")} value={stats.total} />
        <Stat label={t("admin.dashboard.pendingReview")} value={stats.pendingReview} href="/admin/orders?filter=AWAITING_REVIEW" />
        <Stat label={t("admin.dashboard.awaitingPayment")} value={stats.awaitingPayment} href="/admin/orders?filter=AWAITING_PAYMENT" />
        <Stat label={t("admin.dashboard.assigned")} value={stats.assigned} href="/admin/orders?filter=RIDER_ASSIGNED" />
        <Stat label={t("admin.dashboard.inProgress")} value={stats.inProgress} />
        <Stat label={t("admin.dashboard.delivered")} value={stats.delivered} href="/admin/orders?filter=DELIVERED" />
        <Stat label={t("admin.dashboard.cancelled")} value={stats.cancelled} />
        <Stat label={t("admin.dashboard.revenue")} value={formatXaf(stats.revenue)} highlight />
      </div>

      <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <p className="text-xs text-mist-500">{t("admin.dashboard.riderStatus")}</p>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              stats.riderActive ? "bg-safe" : "bg-mist-500"
            )}
          />
          <span className="font-medium">{stats.riderName}</span>
          <span className="text-sm text-mist-500">
            · {stats.riderActive ? t("admin.dashboard.inProgress") : t("admin.dashboard.riderIdle")}
          </span>
        </div>
      </div>
    </div>
  );
}
