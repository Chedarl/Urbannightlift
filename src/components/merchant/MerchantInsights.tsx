"use client";

import { TrendingUp, TrendingDown, Minus, Lightbulb } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { PageHeader, SectionLabel, CardGroup, ListRow, RowDivider } from "@/components/shared/portalKit";
import { MIN_ORDERS_FOR_ADVICE, type SellTonight } from "@/lib/merchants/sellTonight";

const TREND_ICON = {
  GROWING: TrendingUp,
  FADING: TrendingDown,
  STEADY: Minus,
  UNKNOWN: Minus,
} as const;

const TREND_LABEL = {
  GROWING: { en: "Growing", fr: "En hausse" },
  FADING: { en: "Fading", fr: "En baisse" },
  STEADY: { en: "Steady", fr: "Stable" },
  UNKNOWN: { en: "Not enough history yet", fr: "Pas encore assez d'historique" },
} as const;

const TREND_TONE = {
  GROWING: "border-safe/40 bg-safe/10 text-safe",
  FADING: "border-caution/40 bg-caution/10 text-caution",
  STEADY: "border-ink-700 bg-ink-900 text-mist-200",
  UNKNOWN: "border-ink-700 bg-ink-900 text-mist-400",
} as const;

export function MerchantInsights({ report }: { report: SellTonight }) {
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const Icon = TREND_ICON[report.trend];

  return (
    <div>
      <PageHeader
        title={fr ? "Vos chiffres" : "Your numbers"}
        subtitle={
          fr
            ? "Ce que nous voyons passer par Urban Night Lift."
            : "What we can see coming through Urban Night Lift."
        }
        back="/merchant"
      />

      {!report.enoughData ? (
        // Never invent a trend from three orders. A "sales down 40%" built on
        // noise could make a real business change a menu for no reason.
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
          <p className="font-display text-lg font-bold text-mist-100">
            {fr ? "Encore un peu de patience" : "Not enough to go on yet"}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-mist-400">
            {fr
              ? `Nous vous dirons ce qui se vend une fois ${MIN_ORDERS_FOR_ADVICE} commandes passées par nous. Vous en êtes à ${report.orders}. Nous préférons ne rien dire plutôt que de vous donner un chiffre qui ne veut rien dire.`
              : `We'll tell you what sells once ${MIN_ORDERS_FOR_ADVICE} orders have come through us. You're at ${report.orders}. We'd rather say nothing than hand you a number that means nothing.`}
          </p>
        </div>
      ) : (
        <>
          <div className={`rounded-2xl border p-4 ${TREND_TONE[report.trend]}`}>
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5" />
              <p className="font-display text-lg font-bold">
                {fr ? TREND_LABEL[report.trend].fr : TREND_LABEL[report.trend].en}
              </p>
            </div>
            <p className="mt-1 text-xs opacity-80">
              {fr
                ? `${report.orders} commandes livrées via Urban Night Lift`
                : `${report.orders} orders delivered through Urban Night Lift`}
            </p>
          </div>

          {report.top.length > 0 && (
            <>
              <SectionLabel>{fr ? "Ce qui se vend" : "What sells"}</SectionLabel>
              <CardGroup className="mb-5">
                {report.top.map((p, i) => (
                  <div key={p.name}>
                    {i > 0 && <RowDivider />}
                    <ListRow
                      title={p.name}
                      subtitle={
                        fr
                          ? `${Math.round(p.share * 100)} % de ce que vous vendez chez nous`
                          : `${Math.round(p.share * 100)}% of what you sell through us`
                      }
                      trailing={
                        <span className="text-sm font-semibold tabular-nums text-mist-100">
                          {p.units}
                        </span>
                      }
                      chevron={false}
                    />
                  </div>
                ))}
              </CardGroup>
            </>
          )}

          {report.quietNights.length > 0 && (
            <div className="mb-5 rounded-2xl border border-ink-700 bg-ink-900 p-4">
              <p className="text-xs font-semibold text-mist-300">
                {fr ? "Vos soirs calmes" : "Your quiet nights"}
              </p>
              <p className="mt-1.5 text-sm text-mist-200">{report.quietNights.join(", ")}</p>
              <p className="mt-1 text-xs leading-relaxed text-mist-500">
                {fr
                  ? "Rien n'est parti ces soirs-là. C'est là qu'il y a de la place à prendre."
                  : "Nothing moved on those nights. That's where the room is."}
              </p>
            </div>
          )}

          {report.advice.length > 0 && (
            <>
              <SectionLabel>{fr ? "Ce que nous en tirons" : "What we'd suggest"}</SectionLabel>
              <div className="flex flex-col gap-2">
                {report.advice.map((a, i) => (
                  <p
                    key={i}
                    className="flex items-start gap-2.5 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3.5 text-sm leading-relaxed text-mist-200"
                  >
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                    {fr ? a.fr : a.en}
                  </p>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Said out loud, because a merchant could reasonably read these as their
          whole trade and make a decision on that basis. */}
      <p className="mt-5 px-1 text-xs leading-relaxed text-mist-500">
        {fr
          ? "Ces chiffres ne couvrent que les commandes passées par Urban Night Lift — pas vos clients au comptoir."
          : "These numbers only cover orders placed through Urban Night Lift — not your walk-in trade."}
      </p>
    </div>
  );
}
