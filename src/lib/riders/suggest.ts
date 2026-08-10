import { distanceKm } from "@/lib/orders/pricing";

/**
 * Who should take this job, and why.
 *
 * ## The gap this fills
 *
 * A paid, dispatchable order with no rider **sits until a person notices**.
 * Every rider carries an `isOnline` flag and it drove nothing: the assignment
 * screen offered a flat list of every active rider, in no particular order, and
 * a dispatcher at 1 AM had to hold in their head who was working, who was
 * already carrying two jobs, and who was anywhere near the pickup.
 *
 * This ranks them instead. It is the single largest piece of manual work left
 * in the operation, and it is the kind of decision a machine is genuinely
 * better at — it is arithmetic over facts we already store.
 *
 * ## What it deliberately does NOT do
 *
 * **It does not assign anybody.** It returns an ordered list with a reason
 * beside each name, and a person presses the button. That is not timidity: a
 * rider is a human being who is about to ride across Yaoundé at 2 AM, and the
 * things that make one of them the wrong choice tonight — they are ill, their
 * bike is making a noise, they are already halfway home — are all things a
 * dispatcher knows and this function cannot.
 *
 * What it removes is the *searching*, not the *deciding*. And the ranking is
 * recorded on screen, so once there is a night's worth of evidence that the top
 * suggestion was the right one, letting it assign automatically becomes a
 * decision somebody can make on data rather than on faith.
 *
 * ## Why an offline rider is still listed
 *
 * Because at 2 AM there may be nobody online at all, and a screen that answers
 * "no riders" when there are three who could be phoned is worse than useless.
 * Offline riders rank below every online one and say plainly that they are
 * offline. The dispatcher decides whether to ring them.
 *
 * Pure, and proved by `scripts/verify-rider-suggest.ts`, because a ranking that
 * quietly always picks the same person is both an unfair rota and an invisible
 * bug.
 */

/** How stale a position has to be before it stops being a location. */
export const FIX_USEFUL_MS = 15 * 60_000;

/** Above this, a rider is carrying enough. */
export const BUSY_ORDERS = 2;

export interface RiderCandidate {
  id: string;
  fullName: string;
  /** Their own switch. The strongest signal we have about availability. */
  isOnline: boolean;
  /** Last known position, from the most recent order they shared on. */
  lat: number | null;
  lng: number | null;
  /** When that position was taken. An old fix is not a location. */
  fixAt: Date | null;
  /** Orders they are carrying right now. */
  activeOrders: number;
  /**
   * Why they cannot take this job at all — suspended, no float for a shopping
   * order, ID not verified. Set by the caller, which is the only place that
   * knows about the order.
   */
  blockedReason?: string | null;
}

export interface Suggestion {
  rider: RiderCandidate;
  /** Higher is better. Meaningless on its own; only the order matters. */
  score: number;
  /** Straight-line km to the pickup, when we have a usable fix. */
  km: number | null;
  /** Short phrases for the screen, best reason first. */
  reasons: string[];
  reasonsFr: string[];
}

export interface SuggestInput {
  /** Where the rider needs to get to. Null when the order has no pin. */
  pickup: { lat: number; lng: number } | null;
  candidates: RiderCandidate[];
  now?: Date;
}

/**
 * Ranks riders for one job.
 *
 * Blocked riders are dropped entirely rather than ranked last — a name a
 * dispatcher cannot press is a name that wastes a glance. The caller surfaces
 * them separately if it wants to explain the absence.
 */
export function suggestRiders(input: SuggestInput): Suggestion[] {
  const now = input.now ?? new Date();

  return input.candidates
    .filter((r) => !r.blockedReason)
    .map((rider) => score(rider, input.pickup, now))
    .sort(
      (a, b) =>
        b.score - a.score ||
        // A stable tie-break, so the list does not reshuffle on every refresh
        // while a dispatcher is looking at it.
        a.rider.fullName.localeCompare(b.rider.fullName)
    );
}

function score(rider: RiderCandidate, pickup: SuggestInput["pickup"], now: Date): Suggestion {
  const reasons: string[] = [];
  const reasonsFr: string[] = [];
  let score = 0;

  /*
   * Online is worth more than everything else combined, deliberately.
   *
   * A rider two streets away who has gone home is not closer than one across
   * town who is working. No distance advantage should ever float an offline
   * rider above an online one, so this weight is larger than the maximum any
   * other term can contribute.
   */
  if (rider.isOnline) {
    score += 1000;
    reasons.push("On duty");
    reasonsFr.push("En service");
  } else {
    reasons.push("Off duty — you would have to call");
    reasonsFr.push("Hors service — à appeler");
  }

  // Load. Somebody already carrying two is not the answer while anybody else
  // is free, however close they happen to be.
  if (rider.activeOrders === 0) {
    score += 200;
    reasons.push("Free right now");
    reasonsFr.push("Libre maintenant");
  } else if (rider.activeOrders < BUSY_ORDERS) {
    score += 80;
    reasons.push(`Carrying ${rider.activeOrders}`);
    reasonsFr.push(`${rider.activeOrders} course en cours`);
  } else {
    reasons.push(`Already carrying ${rider.activeOrders}`);
    reasonsFr.push(`Déjà ${rider.activeOrders} courses`);
  }

  /*
   * Distance, but only from a fix fresh enough to mean something.
   *
   * A position from forty minutes ago is a place the rider used to be, and
   * ranking on it would send somebody confidently to the wrong side of the
   * city. An unusable fix scores zero for distance rather than a guess — the
   * rider is still listed, just without a claim we cannot support.
   */
  const km = usableKm(rider, pickup, now);
  if (km != null) {
    // Full marks under 1 km, tapering to nothing by 15. Linear rather than
    // clever: a dispatcher has to be able to believe the order it produces.
    score += Math.max(0, Math.round(150 * (1 - Math.min(km, 15) / 15)));
    reasons.push(`${km.toFixed(1)} km from pickup`);
    reasonsFr.push(`à ${km.toFixed(1)} km du ramassage`);
  } else if (pickup) {
    reasons.push("No recent position");
    reasonsFr.push("Position inconnue");
  }

  return { rider, score, km, reasons, reasonsFr };
}

/** Distance to the pickup, or null when we cannot honestly claim one. */
export function usableKm(
  rider: Pick<RiderCandidate, "lat" | "lng" | "fixAt">,
  pickup: { lat: number; lng: number } | null,
  now: Date
): number | null {
  if (!pickup || rider.lat == null || rider.lng == null || !rider.fixAt) return null;
  if (now.getTime() - new Date(rider.fixAt).getTime() > FIX_USEFUL_MS) return null;
  return distanceKm(rider.lat, rider.lng, pickup.lat, pickup.lng);
}

/**
 * The one-line summary for the top suggestion.
 *
 * Written as something a dispatcher would actually say out loud, because the
 * point of the whole module is that they press the button without reading a
 * table.
 */
export function topLine(s: Suggestion, fr: boolean): string {
  const bits = fr ? s.reasonsFr : s.reasons;
  return bits.slice(0, 2).join(" · ");
}
