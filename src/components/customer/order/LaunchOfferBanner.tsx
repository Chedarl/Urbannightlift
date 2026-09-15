import { Gift } from "lucide-react";

import { launchOfferCopy } from "@/lib/orders/launchOffer";

/**
 * The first delivery is free — said where somebody might act on it.
 *
 * ## The gap this closes
 *
 * The offer shipped, worked, and was **invisible until the last screen of the
 * flow**. A customer only found out their first delivery was free after
 * choosing a service, filling in two addresses, describing what they wanted and
 * reaching checkout. By then the offer has done none of the work it exists to
 * do: at zero completed orders the binding constraint is getting somebody to
 * start, and a reason to start that is only revealed at the end is not a reason
 * to start.
 *
 * ## Why it is a server-rendered prop and not a fetch
 *
 * Eligibility is a fact about the database — has this person completed an order
 * — and the browser must never be the one to answer it. The page counts, and
 * passes a cap of zero for anybody who does not qualify. A banner that appears
 * optimistically and retracts is worse than no banner: it has already been read.
 *
 * ## What it will not do
 *
 * **It never appears as decoration.** No banner for somebody who has ordered
 * before, none when the owner has switched the offer off, none "for
 * illustration". A promotional surface that shows an offer the checkout then
 * declines is the single fastest way to teach people that the prices here are
 * not real.
 *
 * **It states the cap.** Above 1,500 XAF the customer pays the difference, and
 * that belongs next to the promise rather than three screens later. The two
 * nearest distance bands are inside the cap, which is most orders — saying so
 * costs a line and removes the one way this could feel like a bait.
 */
export function LaunchOfferBanner({ capXaf, fr }: { capXaf: number; fr: boolean }) {
  // Zero is the "not eligible" answer and the "switched off" answer, and both
  // mean the same thing here: nothing to say.
  if (capXaf <= 0) return null;

  const copy = launchOfferCopy(capXaf, fr);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-safe/30 bg-safe/[0.08] p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-safe/15 text-safe">
        <Gift className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-sm font-bold text-mist-100">{copy.banner}</p>
        <p className="mt-0.5 text-xs text-mist-400">{copy.capNote}</p>
      </div>
    </div>
  );
}
