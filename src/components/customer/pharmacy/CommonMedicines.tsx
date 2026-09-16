"use client";

import { useMemo, useState } from "react";
import { Search, Plus, FileText, Check } from "lucide-react";

import {
  COMMON_PHARMACY_ITEMS,
  PHARMACY_CATEGORIES,
  PHARMACY_CATEGORY_LABEL,
  searchPharmacyItems,
  type PharmacyItem,
  type PharmacyCategory,
} from "@/lib/pharmacy/commonItems";

/**
 * The things a night pharmacy is actually asked for, one tap away.
 *
 * ## Why this is on the screen
 *
 * The medicine list is a row of blank boxes. There is a shelf that fills them,
 * but it reads a *specific merchant's* products and production has no verified
 * pharmacy, so it never appears — leaving somebody with a feverish child typing
 * a drug name from memory at 2 AM into a box a pharmacist will read aloud.
 *
 * These twenty are merchant-independent. They do not claim any pharmacy stocks
 * them; they are the vocabulary, the same way the landmark chips are.
 *
 * ## The prescription flag is the point
 *
 * Whether a molecule needs a prescription is true in every pharmacy in
 * Cameroon, so it can be known before the rider leaves. Tapping Coartem on the
 * over-the-counter branch says so immediately and offers to switch, instead of
 * a rider finding out at a counter at 2 AM with the customer asleep.
 */
export function CommonMedicines({
  fr,
  accent,
  /** True when the customer is on the prescription branch already. */
  onPrescriptionBranch,
  /** Fills a row in the medicine list they already have. */
  onPick,
  /** Moves them to the prescription branch, when a picked item needs one. */
  onNeedsPrescription,
  /** Names already in the list, so a picked one reads as picked. */
  chosen,
}: {
  fr: boolean;
  accent: string;
  onPrescriptionBranch: boolean;
  onPick: (item: PharmacyItem) => void;
  onNeedsPrescription: () => void;
  chosen: string[];
}) {
  const [category, setCategory] = useState<PharmacyCategory>("MALARIA");
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim();
    if (q.length >= 2) return searchPharmacyItems(q, fr);
    return COMMON_PHARMACY_ITEMS.filter((it) => it.category === category);
  }, [query, category, fr]);

  const searching = query.trim().length >= 2;
  const picked = useMemo(
    () => new Set(chosen.map((c) => c.trim().toLowerCase())),
    [chosen]
  );

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="text-sm font-semibold text-mist-100">
          {fr ? "Souvent demandé la nuit" : "Often asked for at night"}
        </p>
        <p className="text-xs text-mist-500">
          {fr ? "Touchez pour ajouter à votre liste" : "Tap to add to your list"}
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-800 px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-mist-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={fr ? "Palu, fièvre, Doliprane…" : "Malaria, fever, Doliprane…"}
          className="w-full bg-transparent text-sm text-mist-100 placeholder:text-mist-500 focus:outline-none"
        />
      </div>

      {/*
        Hidden while searching, because a category filter and a search box that
        both narrow the same list is two controls fighting over one result set —
        and the usual outcome is an empty screen nobody can explain.
      */}
      {!searching && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PHARMACY_CATEGORIES.map((c) => {
            const on = c === category;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  on ? "border-transparent text-ink-950" : "border-ink-700 bg-ink-800/60 text-mist-300"
                }`}
                style={on ? { backgroundColor: accent } : undefined}
              >
                {fr ? PHARMACY_CATEGORY_LABEL[c].fr : PHARMACY_CATEGORY_LABEL[c].en}
              </button>
            );
          })}
        </div>
      )}

      <ul className="mt-3 flex flex-col gap-1.5">
        {results.map((it) => {
          const already = picked.has(it.name.trim().toLowerCase());
          return (
            <li key={it.name}>
              <button
                type="button"
                onClick={() => {
                  onPick(it);
                  if (it.requiresPrescription && !onPrescriptionBranch) onNeedsPrescription();
                }}
                className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                  already ? "border-ink-600 bg-ink-800/40" : "border-ink-700 bg-ink-800/60 active:bg-ink-700"
                }`}
              >
                <span className="mt-0.5 shrink-0">
                  {already ? (
                    <Check className="h-4 w-4" style={{ color: accent }} />
                  ) : (
                    <Plus className="h-4 w-4 text-mist-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-mist-100">{it.name}</span>
                  {/*
                    Two lines, not one wrapping row.

                    These were flex-wrapped with a "·" between them, and at
                    390px the description always wrapped — leaving the separator
                    stranded at the end of the line above it, pointing at
                    nothing. The strength and the form are short and belong
                    together; the sentence belongs on its own line.
                  */}
                  <span className="mt-0.5 block text-xs text-mist-500">
                    {it.strength} · {it.form}
                  </span>
                  <span className="mt-0.5 block text-xs text-mist-500">
                    {fr ? it.descriptionFr : it.description}
                  </span>
                  {/*
                    Said on the item, not in a legend. A customer scanning this
                    list needs to know which of these will need a photograph of
                    a doctor's note before they tap, not after.
                  */}
                  {it.requiresPrescription && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-gold-400/15 px-2 py-0.5 text-xs font-semibold text-gold-300">
                      <FileText className="h-3 w-3" />
                      {fr ? "Ordonnance requise" : "Prescription needed"}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {results.length === 0 && (
        <p className="py-4 text-center text-xs text-mist-500">
          {fr
            ? "Rien dans cette liste ne correspond — écrivez le nom vous-même ci-dessous."
            : "Nothing in this list matches — type the name yourself below."}
        </p>
      )}

      {/*
        Said once, at the bottom, where it cannot be mistaken for a claim about
        the list above. We hold no pharmacy's stock; the pharmacist decides what
        is available and the till decides the price.
      */}
      <p className="mt-3 text-xs text-mist-600">
        {fr
          ? "Cette liste est un aide-mémoire, pas un stock. Le pharmacien confirme la disponibilité et le prix."
          : "This list is a reminder, not a stock list. The pharmacist confirms what's available and what it costs."}
      </p>
    </div>
  );
}
