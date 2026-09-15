"use client";

import { ChevronRight, MapPin, Radio } from "lucide-react";

import { freshLabel } from "@/lib/merchants/freshness";
import { mediaSrc } from "@/lib/uploads/mediaSrc";
import { artworkFor, artworkStyle } from "@/lib/food/artwork";
import type { FoodMerchant } from "@/app/api/food/browse/route";

/**
 * A restaurant in the list: a row, not a billboard.
 *
 * The old card was 220px tall — a 144px cover, a logo overlapping it, then the
 * name. Four of them and you had scrolled a whole phone screen to see four
 * choices, and every cover was the same flat gradient because the catalogue has
 * almost no photographs.
 *
 * This is the same information at a third of the height: the mark, the name,
 * where they are, when they last told us what they have, and how many dishes we
 * hold. Six fit where two did. That is the density lesson from Meituan and
 * Ele.me applied honestly — a list you can scan is worth more than a gallery
 * you cannot fill.
 *
 * The generated artwork carries over unchanged, because the reason for it has
 * not changed: it is stable per restaurant, so a customer recognises a place
 * before reading it, and it is plainly a graphic, so it can never be mistaken
 * for a photograph of food we have not seen.
 */
export function MerchantRow({
  merchant,
  fr,
  inCart,
  onOpen,
}: {
  merchant: FoodMerchant;
  fr: boolean;
  inCart: number;
  onOpen: () => void;
}) {
  const fresh = freshLabel(merchant.checkedAt, fr);
  const art = artworkFor(merchant.name);
  const logo = mediaSrc(merchant.logoUrl);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
        inCart > 0
          ? "border-amber-400/50 bg-amber-500/[0.06]"
          : "border-ink-700 bg-ink-900 hover:border-ink-600"
      }`}
    >
      <span className="relative shrink-0">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-14 w-14 rounded-2xl object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-2xl font-display text-lg font-bold text-white/85"
            style={artworkStyle(artworkFor(merchant.name, "badge"))}
          >
            {art.initials}
          </span>
        )}
        {inCart > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 font-display text-xs font-bold tabular-nums text-ink-950">
            {inCart}
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-display text-sm font-bold text-mist-100">
            {merchant.name}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
              merchant.openNow ? "bg-safe/20 text-safe" : "bg-ink-800 text-mist-500"
            }`}
          >
            {merchant.openNow ? (fr ? "Ouvert" : "Open") : fr ? "Fermé" : "Closed"}
          </span>
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
          {merchant.neighbourhood && (
            <span className="flex items-center gap-1 text-mist-400">
              <MapPin className="h-3 w-3" /> {merchant.neighbourhood}
            </span>
          )}
          {/*
            When the kitchen last told us what is actually on the fire. It is
            the whole differentiator — everywhere else you order a dish and find
            out it ran out when the rider arrives — so it stays with the name
            even at this density.
          */}
          <span
            className={`flex items-center gap-1 ${fresh.fresh ? "text-violet-300" : "text-mist-600"}`}
          >
            <Radio className="h-3 w-3" /> {fresh.text}
          </span>
          {merchant.items.length > 0 && (
            <span className="tabular-nums text-mist-600">
              {merchant.items.length} {fr ? "plats" : "dishes"}
            </span>
          )}
        </span>
      </span>

      <ChevronRight className="h-4 w-4 shrink-0 text-mist-600" />
    </button>
  );
}
