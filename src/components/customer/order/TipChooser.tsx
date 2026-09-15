"use client";

import { Heart } from "lucide-react";

import { TIP_PRESETS_XAF, MAX_TIP_XAF, clampTip } from "@/lib/orders/tip";
import { groupXaf } from "@/lib/utils";

/**
 * Something extra for the rider, offered without being asked for.
 *
 * ## The copy is the feature
 *
 * The mechanics here are four buttons and a number. What matters is what is
 * said around them, because a tip control is one sentence away from being
 * resented:
 *
 * **It never says the rider needs it.** No "riders rely on tips", no "help them
 * earn a living wage", no guilt figure. Those sentences move the employer's
 * obligation onto the customer, and a customer who notices that once notices it
 * every time afterwards. What is true and sufficient is that somebody rode
 * across Yaoundé after midnight to bring this.
 *
 * **It never says the delivery depends on it.** Nothing here is framed as
 * making a rider go faster, take the job, or treat the customer better. That
 * would be a threat wearing a compliment.
 *
 * **Zero is a real option, presented as one.** It leads the row, it is the
 * default, and choosing it produces no warning, no reconsider step, and no
 * change of tone anywhere else in the flow.
 *
 * **It says where the money goes, in words, before it is spent.** The rider
 * keeps all of it, and the sentence differs by payment method because the
 * mechanic differs: on mobile money it rides the payment and we pass it on, on
 * cash the rider is handed it at the door. Saying "added to your payment" on a
 * cash order would be a small lie that a customer discovers at the exact moment
 * they are holding banknotes.
 */

export interface TipChooserProps {
  fr: boolean;
  valueXaf: number;
  onChange: (xaf: number) => void;
  /** Cash and mobile money are handed over differently and read differently. */
  cash: boolean;
}

export function TipChooser({ fr, valueXaf, onChange, cash }: TipChooserProps) {
  const value = clampTip(valueXaf);
  const custom = value > 0 && !(TIP_PRESETS_XAF as readonly number[]).includes(value);

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-mist-500">
        <Heart className="h-3.5 w-3.5 text-violet-300" />
        {fr ? "Pour votre livreur" : "For your rider"}
      </h2>

      <p className="mt-2 text-xs leading-relaxed text-mist-400">
        {fr
          ? "Quelqu'un traverse Yaoundé de nuit pour vous apporter ça. Si vous voulez ajouter quelque chose, c'est ici — sinon, c'est très bien aussi."
          : "Someone is riding across Yaoundé at night to bring you this. If you want to add something, here is where — and if not, that is completely fine."}
      </p>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {TIP_PRESETS_XAF.map((amount) => {
          const selected = !custom && value === amount;
          return (
            <button
              key={amount}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(amount)}
              className={`rounded-lg border px-2 py-2.5 text-center text-xs font-semibold tabular-nums transition-colors ${
                selected
                  ? "border-violet-400/50 bg-violet-500/15 text-violet-200"
                  : "border-ink-700 bg-ink-800 text-mist-300 hover:border-ink-600"
              }`}
            >
              {amount === 0 ? (fr ? "Aucun" : "None") : groupXaf(amount)}
            </button>
          );
        })}
      </div>

      <label className="mt-3 flex items-center gap-2">
        <span className="text-xs text-mist-500">{fr ? "Autre montant" : "Another amount"}</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_TIP_XAF}
          value={custom ? value : ""}
          placeholder="—"
          onChange={(e) => onChange(clampTip(e.target.value))}
          className="w-24 rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-right text-sm tabular-nums text-mist-100"
        />
        <span className="text-xs text-mist-500">XAF</span>
      </label>

      {/*
        Where it goes, said before it is spent — and said differently for the
        two mechanics, because they genuinely are different and the customer is
        about to see which one.
      */}
      {value > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-safe">
          {cash
            ? fr
              ? `${groupXaf(value)} XAF de plus à remettre au livreur à la porte. Il garde la totalité.`
              : `${groupXaf(value)} XAF more to hand your rider at the door. They keep all of it.`
            : fr
              ? `${groupXaf(value)} XAF ajoutés à votre paiement. Le livreur reçoit la totalité — nous ne prenons rien dessus.`
              : `${groupXaf(value)} XAF added to your payment. Your rider receives all of it — we take nothing from it.`}
        </p>
      )}
    </section>
  );
}
