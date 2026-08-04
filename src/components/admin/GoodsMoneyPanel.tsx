import { Receipt, Image as ImageIcon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { orderMoney, isShoppingService } from "@/lib/orders/goodsMoney";
import { checkReceipt, describeCheck } from "@/lib/orders/receiptCheck";
import { formatXaf } from "@/lib/utils";
import type { ServiceType } from "@prisma/client";

/**
 * What was bought, what it cost, and whether the paperwork agrees.
 *
 * The admin order view had **nothing about the shopping money at all**. A rider
 * recorded what the shop charged, uploaded a photograph of the receipt, and
 * dispatch could see neither — the receipt was not rendered on any screen and
 * its storage bucket was not even reachable through the media route. The single
 * most trust-critical number in this product was write-only.
 *
 * So this shows the arithmetic the way the customer's own receipt shows it —
 * cap, shop, fee, total, from `orderMoney` so no screen can invent its own
 * figure — and puts the photograph next to it.
 *
 * The second reading is shown plainly, including when it disagrees. A
 * disagreement is far more often a missing zero than anything dishonest, and
 * showing it here rather than hiding it is what lets a dispatcher settle it in
 * one glance instead of a phone call.
 */
export function GoodsMoneyPanel({
  serviceType,
  goodsCapXaf,
  goodsActualXaf,
  goodsReceiptUrl,
  goodsReceiptReadXaf,
  deliveryFeeXaf,
  overCapApprovedXaf,
}: {
  serviceType: ServiceType;
  goodsCapXaf: number | null;
  goodsActualXaf: number | null;
  goodsReceiptUrl: string | null;
  goodsReceiptReadXaf: number | null;
  deliveryFeeXaf: number | null;
  overCapApprovedXaf: number | null;
}) {
  // Parcels and errands have no shopping money, and an empty money panel on
  // them would be noise on every order that is not a shop run.
  if (!isShoppingService(serviceType)) return null;

  const money = orderMoney({
    serviceType,
    deliveryFeeXaf,
    goodsCapXaf,
    goodsActualXaf,
    overCapApprovedXaf,
  });
  const check = checkReceipt(goodsActualXaf, goodsReceiptReadXaf);

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
      <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-gold-300">
        <Receipt className="h-4 w-4" /> The shopping
      </h2>

      <dl className="flex flex-col gap-1 text-sm">
        <Line label="Their cap" value={goodsCapXaf != null ? formatXaf(goodsCapXaf) : "not set"} />
        <Line
          label="What the shop charged"
          value={goodsActualXaf != null ? formatXaf(goodsActualXaf) : "not recorded yet"}
          strong={goodsActualXaf != null}
        />
        <Line label="Our delivery fee" value={formatXaf(money.deliveryFeeXaf)} />
        <div className="my-1 border-t border-ink-700" />
        <Line
          label={money.totalIsCeiling ? "Up to" : "Total"}
          value={formatXaf(money.totalXaf)}
          strong
        />
      </dl>

      {money.needsCustomerApproval && (
        <p className="mt-3 rounded-lg border border-caution/40 bg-caution/10 p-2 text-xs leading-relaxed text-caution">
          {formatXaf(money.overCapByXaf)} over the cap. Not collectable until the customer agrees.
        </p>
      )}

      {goodsReceiptUrl ? (
        <div className="mt-3 flex flex-col gap-2">
          <a
            href={`/api/media?path=${encodeURIComponent(goodsReceiptUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-gold-400/15 px-2.5 py-1 text-xs font-semibold text-gold-300"
          >
            <ImageIcon className="h-3.5 w-3.5" /> View the shop receipt
          </a>

          {check.verdict !== "unreadable" && (
            <p
              className={`flex items-start gap-1.5 rounded-lg border p-2 text-xs leading-relaxed ${
                check.needsLook
                  ? "border-caution/40 bg-caution/10 text-caution"
                  : "border-safe/40 bg-safe/10 text-safe"
              }`}
            >
              {check.needsLook ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span>
                {describeCheck(check, goodsActualXaf)}
                {check.needsLook && (
                  <>
                    {" "}
                    <span className="text-mist-400">
                      Open the photo and settle it — nothing has been changed, and the recorded
                      amount still stands until somebody corrects it.
                    </span>
                  </>
                )}
              </span>
            </p>
          )}
        </div>
      ) : (
        goodsActualXaf != null && (
          <p className="mt-3 text-xs text-mist-500">
            Recorded without a photo of the receipt.
          </p>
        )
      )}
    </section>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs text-mist-500">{label}</dt>
      <dd className={strong ? "font-semibold text-mist-100" : "text-mist-300"}>{value}</dd>
    </div>
  );
}
