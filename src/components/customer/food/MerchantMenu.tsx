"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, Minus, Plus, Radio, MapPin, UtensilsCrossed } from "lucide-react";

import { groupXaf } from "@/lib/utils";
import { freshLabel } from "@/lib/merchants/freshness";
import { mediaSrc } from "@/lib/uploads/mediaSrc";
import { artworkFor, artworkStyle, initialsOf } from "@/lib/food/artwork";
import { dishGlyphFor } from "@/lib/food/dishGlyph";
import { DishGlyph } from "@/components/customer/food/DishGlyph";
import type { FoodMerchant } from "@/app/api/food/browse/route";

/**
 * One restaurant's menu, built the way the apps that do this at scale build it.
 *
 * ## What changed, and why the old shape had to go
 *
 * The menu used to be an accordion: every restaurant a tall card with a cover
 * photo, tapping one unrolled a two-column grid of dish tiles underneath it. It
 * is the Western delivery-app pattern — a dish gets a whole card — and it has
 * two problems here that it does not have in London.
 *
 * **It is built for photographs we do not have.** A two-column grid of picture
 * tiles with no pictures in it is a page of rectangles, and a page of
 * rectangles reads as broken rather than sparse.
 *
 * **It scrolls.** A forty-item menu is forty scrolls, and the customer never
 * knows where they are in it.
 *
 * Meituan's answer, which Ele.me copies and which is the single most
 * recognisable thing about ordering food in China, is the **left category
 * rail**: categories pinned down the left, dishes on the right, the rail
 * telling you at all times what exists and where you are. Forty items becomes
 * two taps. That is what this is.
 *
 * ## Density, deliberately
 *
 * A dish is a **row** here, not a card: thumbnail, name, one line, price,
 * stepper — three in the space the old grid gave two. Western designers call
 * this cluttered; people ordering dinner call it fast. It is held against this
 * product's 13px floor, so it is dense without ever being small: read
 * one-handed, outdoors, at night.
 *
 * ## What was refused from the same study
 *
 * **A photograph on every dish.** Their menus always carry one; ours essentially
 * never do. Copying it gives grey rectangles. The generated artwork stays —
 * stable per restaurant so you recognise a place before reading it, and plainly
 * a graphic so it can never be mistaken for a photograph of the food.
 *
 * **Coupon confetti.** Stacked discounts and flashing badges are worth building
 * at ten thousand merchants. At four they are decoration pretending to be a
 * marketplace, and this product has been burned once already for showing things
 * it did not have.
 *
 * **The minimum order.** 起送价 blocks checkout below a threshold, which makes
 * sense where a courier carries six orders at once. We have had zero completed
 * orders; refusing a small one is the last thing this business needs. Our
 * minimum lives in the fare, where it is a price rather than a door.
 *
 * One rule survives untouched from the old card, because it is why this
 * catalogue can be trusted: **a sold-out dish is shown as sold out, never
 * quietly removed.** "They ran out tonight" is information; a dish that
 * vanishes reads as one we never had.
 */

/** The "everything" rail row. A category a merchant could never name. */
const ALL = "__all__";

export function MerchantMenu({
  merchant,
  fr,
  quantities,
  onBump,
  onBack,
  onAskFor,
}: {
  merchant: FoodMerchant;
  fr: boolean;
  quantities: Record<string, number>;
  onBump: (itemId: string, delta: number) => void;
  onBack: () => void;
  /**
   * "We don't have their menu — tell us what you want from them anyway."
   *
   * A restaurant we have verified but whose menu we have not collected is the
   * normal state, not an edge case, and it must not be a dead end. In the old
   * accordion the free-text box was literally below the empty menu on the same
   * scroll. Now the menu is its own screen, so that escape has to be a button:
   * it carries the restaurant's name back to the list, where the box is.
   */
  onAskFor: (merchantName: string) => void;
}) {
  const [active, setActive] = useState<string>(ALL);

  /**
   * The rail, with counts.
   *
   * The count beside each label is not decoration: it makes an empty or
   * one-item category visible *before* you tap it, which is the difference
   * between a rail you trust and one you learn to ignore.
   */
  const rail = useMemo(() => {
    const counts = new Map<string, number>();
    const order: string[] = [];
    for (const item of merchant.items) {
      const c = item.category?.trim() || (fr ? "Autres" : "Other");
      if (!counts.has(c)) order.push(c);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const rows = order.map((c) => ({ key: c, label: c, count: counts.get(c) ?? 0 }));
    // One category is a label, not a choice. With a single group the rail would
    // spend a fifth of a phone screen saying nothing.
    if (rows.length < 2) return [];
    return [{ key: ALL, label: fr ? "Tout" : "All", count: merchant.items.length }, ...rows];
  }, [merchant.items, fr]);

  const items = useMemo(() => {
    if (active === ALL) return merchant.items;
    return merchant.items.filter(
      (i) => (i.category?.trim() || (fr ? "Autres" : "Other")) === active
    );
  }, [merchant.items, active, fr]);

  const fresh = freshLabel(merchant.checkedAt, fr);
  const art = artworkFor(merchant.name);
  const logo = mediaSrc(merchant.logoUrl);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        The header is the restaurant, said once and compactly. The old cover
        photo was 144px of gradient on a screen whose job is a menu — the
        identity belongs in a 44px mark, not a hero.
      */}
      <header className="flex items-center gap-3 border-b border-ink-800 px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label={fr ? "Retour aux restaurants" : "Back to restaurants"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-ink-700 bg-ink-900 text-mist-300"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold text-white/85"
            style={artworkStyle(artworkFor(merchant.name, "badge"))}
          >
            {art.initials}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-base font-bold leading-tight text-mist-100">
            {merchant.name}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
            <span
              className={`font-semibold ${merchant.openNow ? "text-safe" : "text-mist-500"}`}
            >
              {merchant.openNow ? (fr ? "Ouvert" : "Open") : fr ? "Fermé" : "Closed"}
            </span>
            {merchant.neighbourhood && (
              <span className="flex items-center gap-1 text-mist-400">
                <MapPin className="h-3 w-3" /> {merchant.neighbourhood}
              </span>
            )}
            {/* The line no competitor here can show, kept beside the name. */}
            <span
              className={`flex items-center gap-1 ${fresh.fresh ? "text-violet-300" : "text-mist-600"}`}
            >
              <Radio className="h-3 w-3" /> {fresh.text}
            </span>
          </p>
        </div>
      </header>

      {merchant.items.length === 0 ? (
        /* Verified, but we have not collected their menu — the normal state, not
           an edge case. It says so and hands over a way through, because a
           restaurant that exists and cannot be ordered from is worse than one
           that is not listed at all. */
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <UtensilsCrossed className="h-8 w-8 text-mist-600" />
          <p className="text-sm font-semibold text-mist-200">
            {fr ? "Nous n'avons pas encore leur carte" : "We don't have their menu yet"}
          </p>
          <p className="max-w-xs text-xs leading-relaxed text-mist-500">
            {fr
              ? "Dites-nous simplement ce que vous voulez de chez eux. Nous appelons et nous confirmons le prix avant d'acheter quoi que ce soit."
              : "Just tell us what you want from them. We call them and confirm the price before buying anything."}
          </p>
          <button
            type="button"
            onClick={() => onAskFor(merchant.name)}
            className="mt-1 rounded-xl bg-amber-500 px-4 py-2.5 font-display text-sm font-bold text-black"
          >
            {fr ? `Commander chez ${merchant.name}` : `Order from ${merchant.name}`}
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {rail.length > 0 && (
            <nav
              aria-label={fr ? "Catégories" : "Categories"}
              className="w-[5.75rem] shrink-0 overflow-y-auto border-r border-ink-800 bg-ink-950/60 sm:w-28"
            >
              {rail.map((c) => {
                const on = active === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setActive(c.key)}
                    aria-current={on ? "true" : undefined}
                    /*
                      The active row is lifted by *removing* the divider and
                      matching the list's ground, so it reads as a tab joined to
                      the panel beside it rather than a highlighted button.
                    */
                    className={`relative block w-full px-2.5 py-3 text-left text-xs leading-snug transition-colors ${
                      on
                        ? "bg-ink-900 font-semibold text-amber-200"
                        : "text-mist-400 hover:text-mist-200"
                    }`}
                  >
                    {on && (
                      <span
                        aria-hidden
                        className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-amber-400"
                      />
                    )}
                    <span className="block break-words">{c.label}</span>
                    <span className="mt-0.5 block text-xs tabular-nums text-mist-600">
                      {c.count}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}

          <ul className="min-w-0 flex-1 overflow-y-auto bg-ink-900">
            {items.map((item) => {
              const qty = quantities[item.id] ?? 0;
              const name = (fr && item.nameFr) || item.name;
              const description = (fr && item.descriptionFr) || item.description;
              const photo = mediaSrc(item.photoUrl);
              // Seeded with the restaurant too, so the same dish name at two
              // places is not identical and one menu reads as a set.
              const dishArt = artworkFor(`${merchant.name} ${item.name}`, "tile");
              // The board's own grouping first, then the dish name. Null when
              // neither says anything we can draw.
              const glyph = dishGlyphFor(item.name, item.category);

              return (
                <li
                  key={item.id}
                  className={`flex gap-3 border-b border-ink-800 px-3 py-3 last:border-b-0 ${
                    item.soldOut ? "opacity-55" : ""
                  }`}
                >
                  <span
                    className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-xl"
                    style={photo ? undefined : artworkStyle(dishArt)}
                  >
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo}
                        alt=""
                        className={`h-full w-full object-cover ${item.soldOut ? "grayscale" : ""}`}
                      />
                    ) : glyph ? (
                      /*
                        The dish, drawn.

                        Two initials on a gradient told a customer nothing about
                        what the dish is — which was the real complaint behind
                        "the food page needs images". A skewer, a fish, a bottle
                        says it at a glance, stays a drawing rather than a claim
                        about this braiseur's food, and is exact at any pixel
                        density because it is a path. `dishGlyphFor` returns null
                        rather than guessing, and the letter below is what a
                        no-match still gets.
                      */
                      <span className="absolute inset-0 flex items-center justify-center text-white/70">
                        <DishGlyph id={glyph} size={26} />
                      </span>
                    ) : (
                      /*
                        A letter of ours, never somebody else's photograph —
                        and the *dish's* letter.

                        `artworkFor` derives both the palette and the initials
                        from one seed, and the seed here is the restaurant plus
                        the dish, so every tile on a menu came out with the
                        restaurant's own initials: eleven dishes, eleven tiles
                        reading "MJ". The colour should be seeded by both (so a
                        menu reads as a set and the same dish differs between
                        two restaurants); the letter has to come from the dish
                        or it says nothing at all.
                      */
                      <span
                        aria-hidden
                        className="absolute -bottom-1.5 right-0.5 select-none font-display text-3xl font-bold leading-none text-white/[0.14]"
                      >
                        {initialsOf(item.name)}
                      </span>
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-mist-100">{name}</p>
                    {description && (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-mist-500">
                        {description}
                      </p>
                    )}
                    <p className="mt-1 flex items-baseline gap-1.5">
                      {item.priceXaf != null ? (
                        <span className="font-display text-sm font-bold tabular-nums text-amber-300">
                          {groupXaf(item.priceXaf)}
                        </span>
                      ) : (
                        /* No price on file is said plainly. The alternative —
                           hiding the dish — loses an order we can still take. */
                        <span className="text-xs text-mist-500">
                          {fr ? "prix confirmé à l'achat" : "price confirmed on buying"}
                        </span>
                      )}
                      {item.unit && <span className="text-xs text-mist-600">/ {item.unit}</span>}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-end">
                    {item.soldOut ? (
                      <span className="rounded-lg border border-ink-700 px-2 py-1 text-xs text-mist-500">
                        {fr ? "Épuisé" : "Sold out"}
                      </span>
                    ) : qty > 0 ? (
                      <span className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onBump(item.id, -1)}
                          aria-label={fr ? `Retirer un ${name}` : `Remove one ${name}`}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-400/50 text-amber-200"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-4 text-center font-display text-sm font-bold tabular-nums text-mist-100">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => onBump(item.id, 1)}
                          aria-label={fr ? `Ajouter un ${name}` : `Add one ${name}`}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-black"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onBump(item.id, 1)}
                        aria-label={fr ? `Ajouter ${name}` : `Add ${name}`}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-black"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
