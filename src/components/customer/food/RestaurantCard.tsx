"use client";

import { useMemo, useState } from "react";
import { MapPin, Clock, Plus, Minus, Radio } from "lucide-react";

import { formatXaf } from "@/lib/utils";
import { freshLabel } from "@/lib/merchants/freshness";
import type { FoodMerchant } from "@/app/api/food/browse/route";

/**
 * A restaurant, the way somebody scrolling at 1 AM decides where to eat.
 *
 * The previous card was a row: a small logo, a name, an accordion of text
 * lines. Correct, and nothing anybody browses. Food is chosen by looking, so
 * this is built the way the delivery apps people here already use are built —
 * a cover, a logo, a category strip, and dishes as cards with a picture and a
 * price.
 *
 * Three rules survive the redesign unchanged, because they are the reason this
 * catalogue is trustworthy at all:
 *
 *  - **Nothing appears that a human has not verified.** Enforced upstream, in
 *    the browse query. An empty page is a correct page.
 *  - **No stock photography, ever.** A dish without a photo gets its own
 *    initial on a warm tile. Putting a beautiful picture of somebody else's
 *    food next to a real business's name is how a customer is disappointed at
 *    the door, and it was live in this product once already.
 *  - **A sold-out dish is shown as sold out, not removed.** "They ran out
 *    tonight" is information. A dish that silently vanishes reads as one we
 *    never had.
 *
 * And one that is new: the card says when the kitchen last told us what they
 * have. That line is the whole differentiator, so it sits beside the name
 * rather than buried at the bottom.
 */

export function RestaurantCard({
  merchant,
  fr,
  open,
  onToggle,
  quantities,
  onBump,
}: {
  merchant: FoodMerchant;
  fr: boolean;
  open: boolean;
  onToggle: () => void;
  quantities: Record<string, number>;
  onBump: (itemId: string, delta: number) => void;
}) {
  const [category, setCategory] = useState<string | null>(null);

  /** The strip across the top of an open menu. Only when it earns its place. */
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const item of merchant.items) {
      const c = item.category?.trim();
      if (c && !seen.includes(c)) seen.push(c);
    }
    // One category is not a choice, it is a label — and a strip of one wastes
    // the most valuable row on a phone screen.
    return seen.length > 1 ? seen : [];
  }, [merchant.items]);

  const items = useMemo(
    () => (category ? merchant.items.filter((i) => i.category?.trim() === category) : merchant.items),
    [merchant.items, category]
  );

  const fresh = freshLabel(merchant.checkedAt, fr);
  const inCart = merchant.items.reduce((n, i) => n + (quantities[i.id] ?? 0), 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
      <button type="button" onClick={onToggle} className="block w-full text-left">
        {/* Their own cover photo if they sent one. Never a stock kitchen. */}
        <span className="relative block h-28 w-full overflow-hidden bg-gradient-to-br from-amber-500/20 to-ink-800">
          {merchant.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/media?path=${encodeURIComponent(merchant.photoUrl)}`}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
          <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink-900 to-transparent" />
          {inCart > 0 && (
            <span className="absolute right-3 top-3 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-ink-950">
              {inCart}
            </span>
          )}
        </span>

        <span className="flex items-start gap-3 px-3 pb-3 pt-0">
          <span className="-mt-6 shrink-0">
            {merchant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media?path=${encodeURIComponent(merchant.logoUrl)}`}
                alt=""
                className="h-14 w-14 rounded-2xl border-2 border-ink-900 object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-ink-900 bg-amber-500/20 text-xl font-bold text-amber-300">
                {merchant.name.charAt(0)}
              </span>
            )}
          </span>

          <span className="min-w-0 flex-1 pt-1">
            <span className="block truncate font-display text-base font-bold text-mist-100">
              {merchant.name}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
              {merchant.neighbourhood && (
                <span className="flex items-center gap-1 text-mist-500">
                  <MapPin className="h-3 w-3" /> {merchant.neighbourhood}
                </span>
              )}
              <span className={`flex items-center gap-1 ${merchant.openNow ? "text-safe" : "text-mist-500"}`}>
                <Clock className="h-3 w-3" />
                {merchant.openNow ? (fr ? "Ouvert" : "Open now") : fr ? "Fermé" : "Closed"}
              </span>
              {/*
                The line no competitor here can show. A kitchen that told us
                what is on the fire in the last couple of hours says so; one
                nobody has asked tonight says that instead of pretending.
              */}
              <span className={`flex items-center gap-1 ${fresh.fresh ? "text-violet-300" : "text-mist-600"}`}>
                <Radio className="h-3 w-3" /> {fresh.text}
              </span>
            </span>
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-ink-700">
          {merchant.items.length === 0 ? (
            <p className="p-3 text-xs text-mist-500">
              {fr
                ? "Pas encore de carte ici. Écrivez ce que vous voulez plus bas."
                : "No menu here yet. Write what you want below."}
            </p>
          ) : (
            <>
              {categories.length > 0 && (
                <div className="flex gap-2 overflow-x-auto px-3 py-2.5">
                  <Chip active={category === null} onClick={() => setCategory(null)}>
                    {fr ? "Tout" : "All"}
                  </Chip>
                  {categories.map((c) => (
                    <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                      {c}
                    </Chip>
                  ))}
                </div>
              )}

              <ul className="grid grid-cols-2 gap-2 p-3 pt-0">
                {items.map((item) => {
                  const qty = quantities[item.id] ?? 0;
                  const name = (fr && item.nameFr) || item.name;
                  const description = (fr && item.descriptionFr) || item.description;
                  return (
                    <li
                      key={item.id}
                      className={`flex flex-col overflow-hidden rounded-xl border ${
                        item.soldOut ? "border-ink-800 bg-ink-950 opacity-60" : "border-ink-700 bg-ink-950"
                      }`}
                    >
                      <span className="relative block h-20 w-full bg-amber-500/10">
                        {item.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/media?path=${encodeURIComponent(item.photoUrl)}`}
                            alt=""
                            className={`h-full w-full object-cover ${item.soldOut ? "grayscale" : ""}`}
                          />
                        ) : (
                          // A letter, not somebody else's photograph.
                          <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-amber-400/40">
                            {name.charAt(0)}
                          </span>
                        )}
                        {item.soldOut && (
                          <span className="absolute inset-x-0 bottom-0 bg-ink-950/90 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-caution">
                            {fr ? "Fini ce soir" : "Sold out tonight"}
                          </span>
                        )}
                      </span>

                      <span className="flex flex-1 flex-col gap-0.5 p-2">
                        <span
                          className={`text-xs font-semibold leading-tight ${
                            item.soldOut ? "text-mist-500" : "text-mist-100"
                          }`}
                        >
                          {name}
                        </span>
                        {description && (
                          <span className="line-clamp-2 text-[10px] leading-snug text-mist-500">
                            {description}
                          </span>
                        )}
                        <span className="mt-auto flex items-center justify-between gap-1 pt-1.5">
                          <span className="text-[11px] font-semibold text-amber-300">
                            {item.priceXaf != null
                              ? formatXaf(item.priceXaf)
                              : fr
                                ? "à confirmer"
                                : "to confirm"}
                          </span>
                          {!item.soldOut && (
                            <span className="flex items-center gap-1">
                              {qty > 0 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onBump(item.id, -1)}
                                    className="flex h-6 w-6 items-center justify-center rounded-lg border border-ink-700 text-mist-300"
                                    aria-label={fr ? "Retirer" : "Remove one"}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <span className="w-3 text-center text-xs font-bold text-mist-100">
                                    {qty}
                                  </span>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => onBump(item.id, 1)}
                                className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/25 text-amber-200"
                                aria-label={fr ? "Ajouter" : "Add one"}
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </span>
                          )}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium ${
        active
          ? "border-amber-400 bg-amber-400/15 text-amber-200"
          : "border-ink-700 text-mist-400 hover:text-mist-200"
      }`}
    >
      {children}
    </button>
  );
}
