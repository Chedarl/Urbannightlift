"use client";

import { useEffect, useState } from "react";
import { Plus, Sparkles, Tag } from "lucide-react";

import { formatXaf } from "@/lib/utils";
import type { ProductResult } from "@/app/api/merchants/[merchantId]/products/route";

/**
 * Things the customer can tap instead of typing into an empty box.
 *
 * Two sources, and the difference between them is stated plainly:
 *  - the chosen merchant's own list, which is a real price we will honour;
 *  - common night dishes with an indicative range, when we don't yet know what
 *    this merchant sells.
 *
 * Blurring the two would be the worst outcome — a customer who believes an
 * indicative range is a quote arrives at a different number and feels cheated.
 */

interface Dish {
  id: string;
  nameEn: string;
  nameFr: string;
  priceMinXaf: number;
  priceMaxXaf: number;
}

export function ProductSuggestions({
  merchantId,
  merchantName,
  accent,
  fr,
  onAdd,
}: {
  merchantId: string | null;
  merchantName: string | null;
  accent: string;
  fr: boolean;
  /** Adds a row to the order. Price is null when it is only indicative. */
  onAdd: (name: string, priceXaf: number | null) => void;
}) {
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!merchantId) {
      setProducts([]);
      return;
    }
    setLoading(true);
    fetch(`/api/merchants/${merchantId}/products`)
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [merchantId]);

  useEffect(() => {
    fetch("/api/dishes")
      .then((r) => r.json())
      .then((d) => setDishes(d.dishes ?? []))
      .catch(() => setDishes([]));
  }, []);

  if (loading) return null;

  if (products.length > 0) {
    return (
      <div className="rounded-2xl border border-ink-700 bg-ink-900/50 p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-mist-400">
          <Tag className="h-3.5 w-3.5" style={{ color: accent }} />
          {fr ? `Au menu chez ${merchantName}` : `On the menu at ${merchantName}`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onAdd(fr ? p.nameFr ?? p.name : p.name, p.priceXaf)}
              className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 text-left text-sm text-mist-100 transition-colors hover:border-violet-500"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
              <span>{fr ? p.nameFr ?? p.name : p.name}</span>
              {p.priceXaf != null && (
                <span className="text-xs font-semibold" style={{ color: accent }}>
                  {formatXaf(p.priceXaf)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (dishes.length === 0) return null;

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900/50 p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-mist-400">
        <Sparkles className="h-3.5 w-3.5" style={{ color: accent }} />
        {fr ? "Populaire ce soir" : "Popular tonight"}
      </p>
      <p className="mt-1 text-[11px] text-mist-500">
        {fr
          ? "Prix indicatifs à Yaoundé — le montant exact est confirmé avec le vendeur avant paiement."
          : "Indicative Yaoundé prices — the exact amount is confirmed with the vendor before you pay."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {dishes.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onAdd(fr ? d.nameFr : d.nameEn, null)}
            className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 text-left text-sm text-mist-100 transition-colors hover:border-violet-500"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
            <span>{fr ? d.nameFr : d.nameEn}</span>
            <span className="text-xs text-mist-500">
              {formatXaf(d.priceMinXaf)}–{formatXaf(d.priceMaxXaf)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
