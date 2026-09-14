"use client";

import { Wallet, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The most we may spend on the customer's behalf.
 *
 * Required on every shopping order, and deliberately in the main column rather
 * than folded away with the preferences: it is a money term, not a nicety. It is
 * the promise the whole no-surprises design rests on — without a ceiling there
 * is nothing to measure an overspend against, and a customer could be handed a
 * bill they never agreed to.
 *
 * The copy does two jobs at once: it explains the cap, and it states the
 * no-markup rule at the exact moment the customer is deciding whether to trust
 * us with their money. Saying "we charge you what the shop charged" here is
 * worth more than saying it anywhere else in the product.
 */
export function SpendingCapField({
  value,
  onChange,
  accent,
  fr,
  error,
  /** Rough guide shown as a placeholder, per service. */
  suggestion,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  accent: string;
  fr: boolean;
  error?: boolean;
  suggestion?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-ink-900/50 p-4",
        error ? "border-restricted" : "border-ink-700"
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-mist-400">
        <Wallet className="h-3.5 w-3.5" style={{ color: accent }} />
        {fr ? "Combien pouvons-nous dépenser au maximum ?" : "How much may we spend, at most?"}
      </p>

      <div className="mt-2 flex items-stretch overflow-hidden rounded-xl border border-ink-700 bg-ink-800 focus-within:border-violet-500">
        <input
          className="w-full bg-transparent px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:outline-none"
          type="number"
          min={0}
          step={500}
          inputMode="numeric"
          placeholder={suggestion ?? (fr ? "ex. 6 000" : "e.g. 6,000")}
          value={value ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(e.target.value === "" || !Number.isFinite(n) ? null : Math.trunc(n));
          }}
          data-error={error ? "true" : undefined}
        />
        <span className="flex items-center border-l border-ink-700 bg-ink-950/40 px-3 text-sm font-semibold text-mist-300">
          XAF
        </span>
      </div>

      {error && (
        <p className="mt-1.5 text-xs text-restricted">
          {fr ? "Indiquez le maximum que nous pouvons dépenser." : "Set the most we should spend."}
        </p>
      )}

      <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-mist-400">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-safe" />
        {fr
          ? "Nous ne dépasserons jamais ce montant sans vous demander d'abord. Vous payez exactement ce que le commerçant facture — sans marge — plus les frais de livraison. Le livreur photographie le reçu."
          : "We'll never go past this without asking you first. You pay exactly what the shop charges — no markup — plus the delivery fee. The rider photographs the receipt."}
      </p>
    </div>
  );
}
