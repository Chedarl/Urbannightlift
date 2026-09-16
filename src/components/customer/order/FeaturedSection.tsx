"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import { BusinessCard, type BusinessAccent } from "@/components/customer/business/BusinessCard";
import { freshLabel } from "@/lib/merchants/freshness";
import type { FeaturedMerchant } from "@/lib/merchants/featured";

/**
 * A service's own shelf on the hub: three real businesses and a way in.
 *
 * ## What this replaces
 *
 * `/order` was seven identical rows — an icon, a name, a sentence, an arrow —
 * each of which led somewhere else. It answered "which of our categories is
 * this?", which is our taxonomy and not the customer's question. Their question
 * is "who is cooking" and "which pharmacy is open", and the answer was two taps
 * away behind a word like *Food pickup*.
 *
 * So the services we actually have businesses for get a shelf: the same
 * `BusinessCard` the picker and the food list use, three of them, and *View
 * all*. The tiles stay for everything else.
 *
 * ## Why this can be empty, and what happens then
 *
 * It renders nothing at all when the catalogue has nothing. That is the whole
 * discipline this product has around the front page — v49 filled it with three
 * invented restaurants and had to take them out — and it means the hub grows as
 * the calling gets done rather than pretending to be finished.
 *
 * ## The colour
 *
 * `ServiceSelection` carries a deliberate decision: one brand, violet, no
 * per-service rainbow across the tiles. That stands. The accent here is not a
 * second brand — it is continuity with the form the tap leads to, which is
 * amber for food and emerald for the pharmacy, so the shelf and the screen it
 * opens are recognisably the same place.
 */
/** The same three the cards use, for the heading and the way in. */
const HEX: Record<BusinessAccent, string> = {
  amber: "#f59e0b",
  emerald: "#10b981",
  violet: "#9645de",
};

export function FeaturedSection({
  title,
  href,
  accent,
  fr,
  merchants,
  viewAllLabel,
  itemNoun,
}: {
  title: string;
  href: string;
  accent: BusinessAccent;
  fr: boolean;
  merchants: FeaturedMerchant[];
  viewAllLabel: string;
  itemNoun?: string;
}) {
  const router = useRouter();

  /*
   * The freshness line waits for the browser.
   *
   * It is the one thing on this card computed from the clock — "confirmed 12
   * minutes ago" — and this section is server-rendered, so the server's minute
   * and the phone's minute decide it separately. On a phone whose clock is off,
   * which is common enough here, those disagree and hydration patches the text
   * after the fact. That is the same shape as the "updated just now ago" bug
   * v50 shipped: a time phrase assembled in two places.
   *
   * So before hydration there is no line, and after it there is the right one.
   * A line that arrives is honest; a line that arrives wrong is not.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (merchants.length === 0) return null;

  return (
    <section className="animate-fade-up mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="flex min-w-0 items-baseline gap-2 font-display text-base font-bold text-mist-100">
          {/*
            The only accent on the shelf itself, and one element of it.
            Enough to make the heading and the amber screen it opens read as the
            same place; not enough to turn a page listing seven services into a
            rainbow, which `ServiceSelection` decided against for good reasons.
          */}
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: HEX[accent] }} />
          <span className="truncate">{title}</span>
        </h2>
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1 text-xs font-semibold"
          style={{ color: HEX[accent] }}
        >
          {viewAllLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {/*
          Navigated by the card's own button rather than wrapped in a link.
          A `<button>` inside an `<a>` is invalid and nests two interactive
          elements, which is a keyboard and screen-reader problem before it is a
          validity one. The heading's "View all" above is the real link, so the
          section is still reachable and shareable without one per card.
        */}
        {merchants.map((m) => (
          <BusinessCard
            key={m.id}
            business={{ ...m, freshness: mounted ? freshLabel(m.checkedAt, fr) : null }}
            accent={accent}
            fr={fr}
            itemNoun={itemNoun}
            onSelect={() => router.push(href)}
          />
        ))}
      </div>
    </section>
  );
}
