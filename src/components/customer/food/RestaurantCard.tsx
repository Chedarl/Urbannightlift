"use client";

import { useMemo, useState } from "react";
import { MapPin, Clock, Plus, Minus, Radio, ChevronDown } from "lucide-react";

import { formatXaf } from "@/lib/utils";
import { freshLabel } from "@/lib/merchants/freshness";
import { mediaSrc } from "@/lib/uploads/mediaSrc";
import { artworkFor, artworkStyle, initialsOf } from "@/lib/food/artwork";
import { dishGlyphFor } from "@/lib/food/dishGlyph";
import { DishGlyph } from "@/components/customer/food/DishGlyph";
import type { FoodMerchant } from "@/app/api/food/browse/route";

/**
 * A restaurant, the way somebody scrolling at 1 AM decides where to eat.
 *
 * ## What was actually wrong with it
 *
 * The structure was already right — cover, logo, category strip, dishes as
 * cards. What made it read as broken was that **the catalogue has almost no
 * photographs**, so in practice every cover was a flat gradient and every dish
 * was a letter on a flat tile. A page of grey rectangles does not look like a
 * design decision; it looks like the images failed to load.
 *
 * So the absence is now the thing that is designed. `artworkFor` turns each
 * name into its own layered night gradient — stable, so a restaurant looks the
 * same every night and a customer recognises it before reading it; distinct, so
 * no two on a screen look alike; and plainly a graphic, so nobody mistakes it
 * for a photograph of the food. When a business does send a photo, it wins and
 * the art disappears underneath it.
 *
 * Four rules survive unchanged, because they are why this catalogue can be
 * trusted at all:
 *
 *  - **Nothing appears that a human has not verified.** Enforced upstream.
 *  - **No stock photography, ever.** This screen shipped invented restaurants
 *    illustrated with hot-linked stock food once already. Generated art is the
 *    answer precisely because it cannot be mistaken for a promise.
 *  - **A sold-out dish is shown as sold out, not removed.** "They ran out
 *    tonight" is information. A dish that vanishes reads as one we never had.
 *  - **The card says when the kitchen last told us what they have.** That line
 *    is the whole differentiator, so it sits with the name.
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

  /*
   * Both of these used to be built by hand as `/api/media?path=…`, which is the
   * route for **private** files: it refuses `merchant-logos` outright and wants
   * a staff session. On a customer's phone the logo could never have loaded,
   * and it read as a failed upload rather than as a wrong URL. `mediaSrc` makes
   * that decision from the bucket, once, for every screen.
   */
  const cover = mediaSrc(merchant.photoUrl);
  const logo = mediaSrc(merchant.logoUrl);
  const art = artworkFor(merchant.name);

  return (
    <section
      className={`overflow-hidden rounded-3xl border bg-ink-900 transition-colors ${
        open ? "border-amber-400/40" : "border-ink-700"
      }`}
    >
      <button type="button" onClick={onToggle} className="block w-full text-left">
        {/* Their own cover if they sent one; otherwise this restaurant's own
            art. Never a stock kitchen, and never a blank grey box either. */}
        <span className="relative block h-36 w-full overflow-hidden" style={artworkStyle(art)}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            /* The initials, set enormous and low-contrast — a mark rather than
               a caption. It reads as intentional at a glance, which a small
               centred letter never did. */
            <span
              aria-hidden
              className="absolute -right-2 bottom-[-1.5rem] select-none font-display text-[7rem] font-bold leading-none text-white/[0.10]"
            >
              {art.initials}
            </span>
          )}

          {/* Grounds the card into the panel below so the cover does not float. */}
          <span className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink-900 via-ink-900/70 to-transparent" />

          <span className="absolute left-3 top-3 flex items-center gap-1.5">
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold backdrop-blur ${
                merchant.openNow ? "bg-safe/25 text-safe" : "bg-ink-950/70 text-mist-400"
              }`}
            >
              <Clock className="h-2.5 w-2.5" />
              {merchant.openNow ? (fr ? "Ouvert" : "Open now") : fr ? "Fermé" : "Closed"}
            </span>
            {merchant.open24h && (
              <span className="rounded-full bg-ink-950/70 px-2 py-0.5 text-xs font-semibold text-violet-200 backdrop-blur">
                24h
              </span>
            )}
          </span>

          {inCart > 0 && (
            <span className="absolute right-3 top-3 rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-ink-950 shadow-lg">
              {inCart}
            </span>
          )}
        </span>

        <span className="flex items-start gap-3 px-4 pb-4 pt-0">
          <span className="-mt-8 shrink-0">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt=""
                className="h-16 w-16 rounded-2xl border-2 border-ink-900 object-cover shadow-xl"
              />
            ) : (
              /* Their own art again, one shade deeper, so a business with no
                 logo still has a mark of its own rather than a grey square. */
              <span
                className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-ink-900 font-display text-lg font-bold text-white/80 shadow-xl"
                style={artworkStyle(artworkFor(merchant.name, "badge"))}
              >
                {art.initials}
              </span>
            )}
          </span>

          <span className="min-w-0 flex-1 pt-1.5">
            <span className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate font-display text-lg font-bold leading-tight text-mist-100">
                {merchant.name}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-mist-500 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {merchant.neighbourhood && (
                <span className="flex items-center gap-1 text-mist-400">
                  <MapPin className="h-3 w-3" /> {merchant.neighbourhood}
                </span>
              )}
              {/*
                The line no competitor here can show. A kitchen that told us
                what is on the fire in the last couple of hours says so; one
                nobody has asked tonight says that instead of pretending.
              */}
              <span className={`flex items-center gap-1 ${fresh.fresh ? "text-violet-300" : "text-mist-600"}`}>
                <Radio className="h-3 w-3" /> {fresh.text}
              </span>
              {merchant.items.length > 0 && (
                <span className="text-mist-600">
                  {merchant.items.length} {fr ? "plats" : "dishes"}
                </span>
              )}
            </span>
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-ink-800">
          {merchant.items.length === 0 ? (
            <p className="px-4 py-5 text-center text-xs leading-relaxed text-mist-500">
              {fr
                ? "Nous n'avons pas encore leur carte. Écrivez ce que vous voulez plus bas — nous appelons et nous confirmons le prix avant d'acheter."
                : "We don't have their menu yet. Write what you want below — we call them and confirm the price before buying anything."}
            </p>
          ) : (
            <>
              {categories.length > 0 && (
                <div className="flex gap-2 overflow-x-auto px-4 py-3">
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

              <ul className="grid grid-cols-2 gap-2.5 p-4 pt-0">
                {items.map((item) => {
                  const qty = quantities[item.id] ?? 0;
                  const name = (fr && item.nameFr) || item.name;
                  const description = (fr && item.descriptionFr) || item.description;
                  const photo = mediaSrc(item.photoUrl);
                  // Seeded with the restaurant too, so the same dish name at two
                  // different places does not come out identical — and so one
                  // restaurant's menu reads as a set rather than a jumble.
                  const dishArt = artworkFor(`${merchant.name} ${item.name}`, "tile");
                  const glyph = dishGlyphFor(item.name, item.category);
                  return (
                    <li
                      key={item.id}
                      className={`flex flex-col overflow-hidden rounded-2xl border transition-colors ${
                        item.soldOut
                          ? "border-ink-800 bg-ink-950 opacity-55"
                          : qty > 0
                            ? "border-amber-400/50 bg-ink-950"
                            : "border-ink-800 bg-ink-950"
                      }`}
                    >
                      <span
                        className="relative block h-24 w-full overflow-hidden"
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
                          // The dish, drawn — a graphic of ours, at a tile size
                          // where a letter said nothing. Falls through to the
                          // letter when nothing matches, never to a guess.
                          <span className="absolute inset-0 flex items-center justify-center text-white/70">
                            <DishGlyph id={glyph} size={40} />
                          </span>
                        ) : (
                          // A letter of ours, not somebody else's photograph.
                          <span
                            aria-hidden
                            className="absolute -bottom-3 right-1 select-none font-display text-5xl font-bold leading-none text-white/[0.13]"
                          >
                            {initialsOf(item.name)}
                          </span>
                        )}
                        {item.soldOut && (
                          <span className="absolute inset-x-0 bottom-0 bg-ink-950/90 py-0.5 text-center text-xs font-semibold uppercase tracking-wide text-caution">
                            {fr ? "Fini ce soir" : "Sold out tonight"}
                          </span>
                        )}
                      </span>

                      <span className="flex flex-1 flex-col gap-0.5 p-2.5">
                        <span
                          className={`text-xs font-semibold leading-tight ${
                            item.soldOut ? "text-mist-500" : "text-mist-100"
                          }`}
                        >
                          {name}
                        </span>
                        {description && (
                          <span className="line-clamp-2 text-xs leading-snug text-mist-500">
                            {description}
                          </span>
                        )}
                        <span className="mt-auto flex items-center justify-between gap-1 pt-2">
                          <span className="font-display text-sm font-bold text-amber-300">
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
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-ink-700 text-mist-300"
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
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-ink-950"
                                aria-label={fr ? "Ajouter" : "Add one"}
                              >
                                <Plus className="h-3.5 w-3.5" />
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
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-amber-400 bg-amber-400/15 text-amber-200"
          : "border-ink-700 text-mist-400 hover:text-mist-200"
      }`}
    >
      {children}
    </button>
  );
}
