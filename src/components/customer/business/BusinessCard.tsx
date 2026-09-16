"use client";

import { ChevronRight, MapPin, Radio, Search } from "lucide-react";

import { artworkFor, artworkStyle } from "@/lib/food/artwork";
import { mediaSrc } from "@/lib/uploads/mediaSrc";
import type { FoodMerchant } from "@/app/api/food/browse/route";
import type { PlaceBusiness } from "@/lib/maps/places";
/*
  Imported rather than defined here, and deliberately not re-exported.

  These used to live in this file, which is `"use client"` — so the hub's
  server-side shelf query called `tagsFromProducts` across the boundary, Next
  replaced it with a client reference, and `/order` returned 500 on every
  request while typecheck, lint, the build and seventy suites all passed.

  Re-exporting them from here would rebuild the same trap for the next caller,
  so anything that needs them imports `@/lib/merchants/tags` directly.
*/
import { tagsFromProducts } from "@/lib/merchants/tags";

/**
 * One business, the same shape whichever service it belongs to.
 *
 * ## Why this is a row and not a card
 *
 * The obvious design — the one the AI Studio prototype uses and the one this
 * product shipped in v49 — is a tall card with a cover image, a logo over it
 * and the name beneath. It was 220px, four of them filled a phone screen, and
 * every cover was the same flat gradient because the catalogue has almost no
 * photographs. `MerchantRow` replaced it with a row a third of the height and
 * six fit where two did.
 *
 * That lesson is not worth unlearning for a prettier grid, so this is the row,
 * generalised: the mark, the name, where it is, and one line of whatever that
 * particular business is known for. `MerchantRow` is now this component with
 * food's cart badge on it, so the two cannot drift apart.
 *
 * ## The distinction this card exists to make visible
 *
 * A business we have called and confirmed and one we found on a map are not the
 * same thing, and the difference has to be legible at a glance rather than
 * buried in a tooltip. A **verified** row is a partner: it can carry a menu, an
 * item count, and when they last told us what they have. A **discovered** row
 * says where it was found and offers to send a rider — nothing more, because
 * nothing more is known. No menu, no prices, no rating, no photograph.
 *
 * This product once shipped three invented restaurants with fabricated menus
 * and stock photography, live, and a customer could order a named dish at a
 * named price from a business that may not exist. The card is where that
 * distinction is either kept or quietly lost.
 */

export type BusinessAccent = "amber" | "emerald" | "violet";

/**
 * The accent per service, from `CartBar`'s vocabulary so the two agree: amber
 * food, emerald pharmacy, violet parcel.
 */
const ACCENTS: Record<BusinessAccent, { hex: string; ring: string; wash: string; text: string }> = {
  amber: { hex: "#f59e0b", ring: "border-amber-400/50", wash: "bg-amber-500/[0.06]", text: "text-amber-300" },
  emerald: { hex: "#10b981", ring: "border-emerald-400/50", wash: "bg-emerald-500/[0.06]", text: "text-emerald-300" },
  violet: { hex: "#9645de", ring: "border-violet-400/50", wash: "bg-violet-500/[0.06]", text: "text-violet-300" },
};

export interface BusinessCardData {
  id: string;
  name: string;
  /** Neighbourhood or street, in one line. */
  where: string | null;
  /**
   * A human confirmed this business exists and takes our orders.
   *
   * False means found on a map and nothing more. Never set true from anything
   * a third party said.
   */
  verified: boolean;
  /** Null when we genuinely do not know, which is the honest state for a find. */
  openNow: boolean | null;
  /** Only ever one of our own uploads — `mediaSrc` refuses anything else. */
  logoUrl: string | null;
  /** How many dishes or products we hold. Null for a business we have no menu for. */
  itemCount: number | null;
  /**
   * What this business is known for — "Brochettes", "Poisson", "Poulet".
   *
   * The single biggest visual difference between a card that reads as a real
   * place and one that reads as a database row, and it costs nothing: these are
   * the merchant's *own* product categories, which `MerchantProduct.category`
   * already holds because it is what turns their price list into something
   * browsable. Nothing here is guessed at, and a business with no products
   * shows none.
   */
  tags: string[];
  /**
   * One thing that is true tonight and matters more than anything else on the
   * card — the pharmacie de garde, in practice.
   *
   * Deliberately a single slot rather than a list. A row of badges is a row
   * nobody reads; the point of this one is that it is the only one.
   */
  badge: { label: string; labelFr: string } | null;
  /** How far, when both ends are known. Null rather than estimated. */
  distanceKm: number | null;
  /** When they last told us what they actually have, already worded. */
  freshness: { fresh: boolean; text: string } | null;
}

export function BusinessCard({
  business,
  accent,
  fr,
  actionLabel,
  badgeCount = 0,
  itemNoun,
  onSelect,
}: {
  business: BusinessCardData;
  accent: BusinessAccent;
  fr: boolean;
  /** "Voir le menu", "Commander des médicaments" — the only per-service word. */
  actionLabel?: string;
  /** Items already in the cart from this business. Food's list uses it. */
  badgeCount?: number;
  /**
   * What this business's items are called — "plats", "dishes", "produits".
   *
   * A pharmacy does not have dishes and a restaurant does not have products.
   * Defaulted rather than required, because the generic word is right for a
   * picker that mixes services and wrong only where a service knows better.
   */
  itemNoun?: string;
  onSelect: () => void;
}) {
  const tone = ACCENTS[accent];
  const art = artworkFor(business.name);
  const logo = mediaSrc(business.logoUrl);
  const active = badgeCount > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={actionLabel ? `${business.name} — ${actionLabel}` : business.name}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
        active ? `${tone.ring} ${tone.wash}` : "border-ink-700 bg-ink-900 hover:border-ink-600"
      }`}
    >
      <span className="relative shrink-0">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-14 w-14 rounded-2xl object-cover" />
        ) : (
          /*
            A generated mark, never a photograph and never somebody else's logo.
            Stable per name, so a customer recognises a place before reading it,
            and plainly a graphic, so it cannot be mistaken for a picture of food
            we have not seen.
          */
          <span
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-2xl font-display text-lg font-bold text-white/85"
            style={artworkStyle(artworkFor(business.name, "badge"))}
          >
            {art.initials}
          </span>
        )}
        {active && (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-display text-xs font-bold tabular-nums text-ink-950"
            style={{ backgroundColor: tone.hex }}
          >
            {badgeCount}
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-display text-sm font-bold text-mist-100">
            {business.name}
          </span>
          {/*
            The one thing that is true tonight, ahead of the open/closed pill:
            a pharmacy on duty is the reason somebody opened this screen at all.
          */}
          {business.badge && (
            <span className="shrink-0 rounded-full bg-teal-400/15 px-2 py-0.5 text-xs font-semibold text-teal-300">
              {fr ? business.badge.labelFr : business.badge.label}
            </span>
          )}
          {business.openNow !== null && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                business.openNow ? "bg-safe/20 text-safe" : "bg-ink-800 text-mist-500"
              }`}
            >
              {business.openNow ? (fr ? "Ouvert" : "Open") : fr ? "Fermé" : "Closed"}
            </span>
          )}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
          {business.where && (
            <span className="flex items-center gap-1 truncate text-mist-400">
              <MapPin className="h-3 w-3 shrink-0" /> {business.where}
            </span>
          )}

          {business.distanceKm != null && (
            <span className="tabular-nums text-mist-500">{business.distanceKm.toFixed(1)} km</span>
          )}

          {business.verified ? (
            <>
              {/*
                When the kitchen last told us what is actually on the fire —
                the whole differentiator, so it stays with the name even at this
                density. Only a partner has one; a find has never told us
                anything.
              */}
              {business.freshness && (
                <span className={`flex items-center gap-1 ${business.freshness.fresh ? "text-violet-300" : "text-mist-600"}`}>
                  <Radio className="h-3 w-3" /> {business.freshness.text}
                </span>
              )}
              {business.itemCount != null && business.itemCount > 0 && (
                <span className="tabular-nums text-mist-600">
                  {business.itemCount} {itemNoun ?? (fr ? "articles" : "items")}
                </span>
              )}
            </>
          ) : (
            /*
              Said plainly, in the row, in the customer's own language. Not a
              badge they have to decode and not a footnote: "we found this on a
              map, we have not spoken to them, and the rider will go and ask."
            */
            <span className="flex items-center gap-1 text-mist-500">
              <Search className="h-3 w-3 shrink-0" />
              {fr ? "Trouvé sur la carte — nous appellerons" : "Found on the map — we'll call ahead"}
            </span>
          )}
        </span>
        {/*
          What they are known for, in their own words.

          Placed under the meta line rather than beside the name, because at
          390px a name and three chips on one row means a truncated name — and
          the name is the thing somebody is scanning for.
        */}
        {business.tags.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {business.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-md bg-ink-800 px-1.5 py-0.5 text-xs text-mist-400"
              >
                {t}
              </span>
            ))}
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-1">
        {actionLabel && (
          <span className={`hidden text-xs font-semibold sm:inline ${tone.text}`}>{actionLabel}</span>
        )}
        <ChevronRight className="h-4 w-4 text-mist-600" />
      </span>
    </button>
  );
}

/** A catalogued merchant as this card reads it. */
export function fromMerchant(
  m: FoodMerchant,
  freshness: { fresh: boolean; text: string } | null
): BusinessCardData {
  return {
    id: m.id,
    name: m.name,
    where: m.neighbourhood ?? m.address,
    verified: true,
    openNow: m.openNow,
    logoUrl: m.logoUrl,
    itemCount: m.items.length,
    tags: tagsFromProducts(m.items),
    badge: null,
    distanceKm: null,
    freshness,
  };
}


/**
 * A business found on the map as this card reads it.
 *
 * Note what is dropped on the way through, and that all of it is dropped on
 * purpose: `verified` is false and never derived from anything Google said,
 * `logoUrl` is null because a business's mark is its trademark and the licit
 * route to it is the business uploading it, `itemCount` and `freshness` are
 * null because we hold no menu and they have told us nothing.
 *
 * `openNow` is null rather than guessed. Places returns weekly opening hours as
 * text, and reading "open now" out of them means deciding what a Yaoundé public
 * holiday does to a Sunday — a wrong "Open" sends a rider to a locked door.
 */
export function fromPlace(p: PlaceBusiness): BusinessCardData {
  return {
    id: p.placeId,
    name: p.name,
    where: p.formattedAddress || null,
    verified: false,
    openNow: null,
    logoUrl: null,
    itemCount: null,
    /*
      Google's `primaryType` is a taxonomy code — `meal_takeaway` — not
      something a customer recognises, and we hold no products for a business
      nobody here has spoken to. So a find shows no tags rather than a
      machine-readable one.
    */
    tags: [],
    badge: null,
    distanceKm: null,
    freshness: null,
  };
}
