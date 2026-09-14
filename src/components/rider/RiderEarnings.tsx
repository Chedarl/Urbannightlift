"use client";

import { Wallet, Banknote, ShoppingBag } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { PageHeader, SectionLabel, CardGroup, ListRow, RowDivider } from "@/components/shared/portalKit";
import { formatXaf } from "@/lib/utils";
import type { ServiceType } from "@prisma/client";

interface Row {
  id: string;
  orderCode: string;
  at: string | null;
  serviceType: ServiceType;
  payoutXaf: number;
  advancedXaf: number;
  settled: boolean;
}

export function RiderEarnings({
  totals,
  float,
  ledger,
  rows,
}: {
  totals: {
    tonightXaf: number;
    weekXaf: number;
    allTimeXaf: number;
    deliveries: number;
    owedToCompanyXaf: number;
  };
  float: {
    limitXaf: number;
    balanceXaf: number;
    advancedXaf: number;
    spendableXaf: number;
    suspended: boolean;
  };
  ledger: { id: string; amountXaf: number; type: string; note: string | null; at: string }[];
  rows: Row[];
}) {
  const { t, locale } = useTranslation();
  const fr = locale === "fr";

  return (
    <div>
      <PageHeader
        title={fr ? "Vos gains" : "Your earnings"}
        subtitle={
          fr
            ? `${totals.deliveries} livraisons terminées`
            : `${totals.deliveries} completed deliveries`
        }
        back="/rider/dashboard"
      />

      <div className="mb-5 rounded-2xl border border-gold-400/40 bg-gold-400/5 p-5">
        <p className="text-xs text-mist-400">{fr ? "Ce soir" : "Tonight"}</p>
        <p className="mt-1 font-display text-3xl font-bold text-gold-400">
          {formatXaf(totals.tonightXaf)}
        </p>
        <div className="mt-4 flex gap-6 border-t border-gold-400/20 pt-3">
          <div>
            <p className="text-xs text-mist-500">{fr ? "7 derniers jours" : "Last 7 days"}</p>
            <p className="text-sm font-semibold text-mist-200">{formatXaf(totals.weekXaf)}</p>
          </div>
          <div>
            <p className="text-xs text-mist-500">{fr ? "Depuis le début" : "All time"}</p>
            <p className="text-sm font-semibold text-mist-200">{formatXaf(totals.allTimeXaf)}</p>
          </div>
        </div>
      </div>

      {/* Kept visually apart from earnings on purpose: this is the company's
          money passing through their hands, not theirs. */}
      <SectionLabel>{fr ? "Caisse de la société" : "Company cash"}</SectionLabel>
      <CardGroup className="mb-5">
        {float.limitXaf <= 0 ? (
          <ListRow
            icon={<Wallet className="h-4 w-4" />}
            title={fr ? "Pas encore de caisse" : "No float yet"}
            subtitle={
              fr
                ? "Sans caisse, pas de courses repas ou pharmacie. Demandez-en une au dispatch."
                : "Without one you can't take food or pharmacy jobs. Ask dispatch for a float."
            }
            chevron={false}
          />
        ) : (
          <>
            <ListRow
              icon={<Wallet className="h-4 w-4" />}
              title={fr ? "Argent en votre possession" : "Cash you're holding"}
              subtitle={fr ? `Plafond ${formatXaf(float.limitXaf)}` : `Limit ${formatXaf(float.limitXaf)}`}
              trailing={<span className="text-sm font-semibold tabular-nums text-mist-100">{formatXaf(float.balanceXaf)}</span>}
              chevron={false}
            />
            <RowDivider />
            <ListRow
              icon={<ShoppingBag className="h-4 w-4" />}
              title={fr ? "Déjà dépensé pour des clients" : "Already spent for customers"}
              subtitle={
                fr
                  ? "Vous récupérez cela au règlement — ce n'est pas votre argent."
                  : "You get this back at settlement — it was never your money."
              }
              trailing={<span className="text-sm font-semibold tabular-nums text-mist-100">{formatXaf(float.advancedXaf)}</span>}
              chevron={false}
            />
            <RowDivider />
            <ListRow
              icon={<Banknote className="h-4 w-4" />}
              title={fr ? "Reste à dépenser" : "Left to spend"}
              trailing={<span className="text-sm font-semibold tabular-nums text-gold-400">{formatXaf(float.spendableXaf)}</span>}
              chevron={false}
              tone="accent"
            />
          </>
        )}
      </CardGroup>

      {/* Sign matters here, so it is spelled out in words rather than a minus. */}
      <div className="mb-5 rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <p className="text-xs text-mist-500">
          {totals.owedToCompanyXaf >= 0
            ? fr
              ? "À remettre au prochain règlement"
              : "To hand over at the next settlement"
            : fr
              ? "Que la société vous doit"
              : "The company owes you"}
        </p>
        <p
          className={`mt-1 font-display text-2xl font-bold ${
            totals.owedToCompanyXaf >= 0 ? "text-mist-100" : "text-safe"
          }`}
        >
          {formatXaf(Math.abs(totals.owedToCompanyXaf))}
        </p>
      </div>

      {rows.length > 0 && (
        <>
          <SectionLabel>{fr ? "Vos livraisons" : "Your deliveries"}</SectionLabel>
          <CardGroup className="mb-5">
            {rows.map((r, i) => (
              <div key={r.id}>
                {i > 0 && <RowDivider />}
                <ListRow
                  title={
                    <span className="flex items-center gap-2">
                      <span className="font-display font-bold text-gold-400">{r.orderCode}</span>
                      <span className="text-xs font-normal text-mist-500">
                        {t(`services.${r.serviceType}.name`)}
                      </span>
                    </span>
                  }
                  subtitle={
                    r.advancedXaf > 0
                      ? fr
                        ? `Vous avez avancé ${formatXaf(r.advancedXaf)}${r.settled ? " · réglé" : ""}`
                        : `You advanced ${formatXaf(r.advancedXaf)}${r.settled ? " · settled" : ""}`
                      : r.at
                        ? new Date(r.at).toLocaleDateString(fr ? "fr-FR" : "en-GB", {
                            day: "numeric",
                            month: "short",
                          })
                        : undefined
                  }
                  trailing={
                    <span className="text-sm font-semibold tabular-nums text-mist-100">
                      {formatXaf(r.payoutXaf)}
                    </span>
                  }
                  chevron={false}
                  href={`/rider/orders/${r.id}`}
                />
              </div>
            ))}
          </CardGroup>
        </>
      )}

      {ledger.length > 0 && (
        <>
          <SectionLabel>{fr ? "Mouvements de caisse" : "Float movements"}</SectionLabel>
          <CardGroup>
            {ledger.map((l, i) => (
              <div key={l.id}>
                {i > 0 && <RowDivider />}
                <ListRow
                  title={
                    l.type === "TOPUP"
                      ? fr ? "Argent reçu" : "Cash handed to you"
                      : l.type === "RETURN"
                        ? fr ? "Argent rendu" : "Cash you handed back"
                        : fr ? "Correction" : "Correction"
                  }
                  subtitle={
                    l.note ??
                    new Date(l.at).toLocaleDateString(fr ? "fr-FR" : "en-GB", {
                      day: "numeric",
                      month: "short",
                    })
                  }
                  trailing={
                    <span
                      className={`text-sm font-semibold tabular-nums ${l.amountXaf < 0 ? "text-safe" : "text-mist-100"}`}
                    >
                      {l.amountXaf > 0 ? "+" : ""}
                      {formatXaf(l.amountXaf)}
                    </span>
                  }
                  chevron={false}
                />
              </div>
            ))}
          </CardGroup>
        </>
      )}
    </div>
  );
}
