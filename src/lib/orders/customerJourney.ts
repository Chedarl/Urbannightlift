import type { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { isPayOnDelivery } from "@/lib/orders/dispatchRules";
import { formatXaf } from "@/lib/utils";

/**
 * The customer's night, as five stages that only move forwards.
 *
 * The confirmation screen used to render everything it might ever need at once:
 * the quote card, the payment card, the delivery code, the receipt button, the
 * confirm-receipt box, the reorder prompt and the timeline, all stacked, all
 * present from the first second. A customer who had just paid still had the
 * payment card in front of them. A customer waiting on a price still had a
 * "confirm you received it" box below the fold. Nothing on the screen said
 * which of those things was theirs to do now, and nothing looked finished when
 * it was finished — so the whole page read as a pile of options rather than a
 * delivery in progress.
 *
 * This is the same discipline the dispatch console got, from the other side of
 * the counter: exactly one stage is live, the stages behind it collapse to a
 * single line of what happened and when, and the stages ahead are named but
 * shut. Uber and DoorDash both do this — one headline, one action, everything
 * else out of the way — and it is why their tracking screens feel calm while a
 * stack of cards feels like homework.
 *
 * Whose turn it is matters as much as where we are, so every stage carries it:
 * `YOURS` means the customer is holding the order up, `OURS` means they can put
 * the phone down. Telling somebody they are waiting on us is most of what makes
 * waiting bearable.
 */

export type JourneyKey = "PLACED" | "QUOTE" | "PAYMENT" | "ON_THE_WAY" | "RECEIVED";

export type JourneyState =
  /** Behind us. Collapsed to a line of proof. */
  | "DONE"
  /** This is where the order is right now. */
  | "ACTIVE"
  /** Not yet reachable. Named, so the customer knows what is coming, but shut. */
  | "LOCKED"
  /** Cancelled or held before reaching this stage. It is not coming. */
  | "STOPPED";

/** Who the order is waiting on. */
export type Turn = "YOURS" | "OURS";

export interface JourneyInput {
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  quoteSentAt: Date | string | null;
  quoteAcceptedAt: Date | string | null;
  quoteDeclinedAt: Date | string | null;
  quotedFeeXaf: number | null;
  riderName: string | null;
  otpIssued: boolean;
  customerConfirmedAt: Date | string | null;
  deliveredAt: Date | string | null;
}

export interface JourneyStage {
  key: JourneyKey;
  number: number;
  /** The stage's name, as the customer would say it. */
  title: string;
  /** When ACTIVE: what is happening, in one sentence. */
  headline: string;
  /** When ACTIVE and it is ours: roughly how long, so the wait has a shape. */
  waitHint: string | null;
  state: JourneyState;
  turn: Turn;
  /** When DONE: what happened and when. The whole of a finished stage. */
  proof: string | null;
  at: Date | null;
  /** When LOCKED: what has to happen before this opens. */
  blockedBy: string | null;
}

const STOPPED_STATUSES: OrderStatus[] = [
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_UNL",
  "REJECTED",
  "FAILED_DELIVERY",
  "REFUND_PENDING",
  "REFUNDED",
  "SAFETY_HOLD",
];

const OUT_WITH_RIDER: OrderStatus[] = [
  "RIDER_ASSIGNED",
  "RIDER_GOING_TO_PICKUP",
  "RIDER_ARRIVED_AT_PICKUP",
  "ITEM_COLLECTED",
  "RIDER_GOING_TO_DELIVERY",
  "RIDER_ARRIVED_AT_DELIVERY",
  "DELIVERY_PROOF_SUBMITTED",
];

/**
 * The rider has your goods and is coming to you — the point where "on the way"
 * stops being the thing to watch and the handover becomes the thing to do.
 *
 * This is the same list the confirmation screen has always used to decide
 * whether receipt can be confirmed, kept here so the stage that carries the
 * delivery code and the stage that accepts the confirmation are the same stage.
 */
const HANDOVER: OrderStatus[] = [
  "RIDER_GOING_TO_DELIVERY",
  "RIDER_ARRIVED_AT_DELIVERY",
  "DELIVERY_PROOF_SUBMITTED",
  "DELIVERED",
];

function asDate(v: Date | string | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clockOf(v: Date | string | null, fr: boolean): string {
  const d = asDate(v);
  if (!d) return "";
  return d.toLocaleTimeString(fr ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Empty rather than an em-dash: a missing price should read as absent, not as zero. */
function money(xaf: number | null): string {
  return xaf == null ? "" : formatXaf(xaf);
}

/**
 * The five stages, decided only from what is already on the order.
 *
 * Nothing here guesses: a stage is finished when there is a timestamp proving
 * it, so this can never claim more progress than actually happened.
 */
export function buildJourney(o: JourneyInput, fr: boolean): JourneyStage[] {
  const stopped = STOPPED_STATUSES.includes(o.orderStatus);
  const payOnDelivery = isPayOnDelivery(o.paymentMethod);

  const quoteDone = o.quoteAcceptedAt != null;
  const paymentDone = quoteDone && (o.paymentStatus === "VERIFIED" || payOnDelivery);
  const dispatched = o.riderName != null && OUT_WITH_RIDER.includes(o.orderStatus);
  // "On the way" is finished the moment the rider is bringing the goods to you.
  // From there the live stage is the handover itself, which is where the
  // delivery code and the confirmation both belong.
  const arrived =
    o.customerConfirmedAt != null || o.orderStatus === "CLOSED" || HANDOVER.includes(o.orderStatus);
  const received = o.customerConfirmedAt != null;

  // Stage 1 closes the moment we have priced it — that is the whole of our
  // review, from the customer's side.
  const placedDone = o.quoteSentAt != null || quoteDone || paymentDone || dispatched || arrived;
  const declined = o.quoteDeclinedAt != null && !quoteDone;

  const stages: Omit<JourneyStage, "state">[] = [
    {
      key: "PLACED",
      number: 1,
      title: fr ? "Commande reçue" : "Order received",
      headline: fr
        ? "Nous vérifions votre commande et préparons votre prix."
        : "We're checking your order and working out your price.",
      waitHint: fr ? "En général sous 10 minutes" : "Usually within 10 minutes",
      turn: "OURS",
      proof: placedDone
        ? fr
          ? `Reçue et vérifiée à ${clockOf(o.quoteSentAt, fr) || "—"}`
          : `Received and checked at ${clockOf(o.quoteSentAt, fr) || "—"}`
        : null,
      at: asDate(o.quoteSentAt),
      blockedBy: null,
    },
    {
      key: "QUOTE",
      number: 2,
      title: fr ? "Votre prix" : "Your price",
      headline: declined
        ? fr
          ? "Vous avez refusé ce prix. Nous vous en proposons un autre."
          : "You turned this price down. We're working out another one."
        : fr
          ? "Voici votre prix. Rien ne bouge tant que vous ne l'avez pas accepté."
          : "Here's your price. Nothing moves until you accept it.",
      waitHint: declined ? (fr ? "Nous revenons vers vous" : "We'll come back to you") : null,
      turn: declined ? "OURS" : "YOURS",
      proof: quoteDone
        ? fr
          ? `${money(o.quotedFeeXaf)} accepté à ${clockOf(o.quoteAcceptedAt, fr)}`
          : `${money(o.quotedFeeXaf)} accepted at ${clockOf(o.quoteAcceptedAt, fr)}`
        : null,
      at: asDate(o.quoteAcceptedAt),
      blockedBy: fr ? "Nous préparons d'abord votre prix." : "We're working out your price first.",
    },
    {
      key: "PAYMENT",
      number: 3,
      title: fr ? "Paiement" : "Payment",
      headline: payOnDelivery
        ? fr
          ? "Vous payez le livreur à la porte. Rien à faire maintenant."
          : "You pay the rider at the door. Nothing to do now."
        : fr
          ? "Payez pour qu'un livreur parte. Nous vérifions puis nous roulons."
          : "Pay so a rider can set off. We check it, then we ride.",
      waitHint:
        o.paymentStatus === "SUBMITTED_UNVERIFIED"
          ? fr
            ? "Nous vérifions votre paiement"
            : "We're checking your payment"
          : null,
      turn: payOnDelivery || o.paymentStatus === "SUBMITTED_UNVERIFIED" ? "OURS" : "YOURS",
      proof: paymentDone
        ? payOnDelivery
          ? fr
            ? "Paiement à la livraison — vous payez le livreur à la porte"
            : "Cash on delivery — you pay the rider at the door"
          : fr
            ? `Paiement confirmé à ${clockOf(o.quoteAcceptedAt, fr)}`
            : `Payment confirmed at ${clockOf(o.quoteAcceptedAt, fr)}`
        : null,
      at: asDate(o.quoteAcceptedAt),
      blockedBy: fr ? "Acceptez d'abord votre prix." : "Accept your price first.",
    },
    {
      key: "ON_THE_WAY",
      number: 4,
      title: fr ? "Livreur en route" : "Rider on the way",
      headline: o.riderName
        ? fr
          ? `${o.riderName} a votre commande et arrive.`
          : `${o.riderName} has your order and is on the way.`
        : fr
          ? "Nous envoyons un livreur vers vous."
          : "We're sending a rider out to you.",
      waitHint: fr ? "Suivez-le sur la carte ci-dessous" : "Follow them on the map below",
      turn: "OURS",
      proof: arrived
        ? fr
          ? `${o.riderName ?? "Le livreur"} vous a apporté votre commande`
          : `${o.riderName ?? "Your rider"} brought your order to you`
        : null,
      at: asDate(o.deliveredAt),
      blockedBy: payOnDelivery
        ? fr
          ? "Acceptez d'abord votre prix."
          : "Accept your price first."
        : fr
          ? "Nous attendons votre paiement."
          : "We're waiting for your payment.",
    },
    {
      key: "RECEIVED",
      number: 5,
      title: fr ? "Reçu" : "Received",
      headline: fr
        ? "Donnez votre code seulement quand vous avez la marchandise en main."
        : "Give your code only once the goods are in your hands.",
      waitHint: null,
      turn: "YOURS",
      proof: received
        ? fr
          ? `Vous avez confirmé la réception à ${clockOf(o.customerConfirmedAt, fr)}`
          : `You confirmed receipt at ${clockOf(o.customerConfirmedAt, fr)}`
        : null,
      at: asDate(o.customerConfirmedAt),
      blockedBy: fr ? "Votre livreur n'est pas encore parti." : "Your rider hasn't set off yet.",
    },
  ];

  const doneFlags = [placedDone, quoteDone, paymentDone, arrived, received];

  return stages.map((stage, i) => {
    if (doneFlags[i]) return { ...stage, state: "DONE" as const };
    if (stopped) return { ...stage, state: "STOPPED" as const };
    const previousDone = i === 0 || doneFlags[i - 1];
    return { ...stage, state: previousDone ? ("ACTIVE" as const) : ("LOCKED" as const) };
  });
}

/** The stage the order is sitting on, or null once it is all behind them. */
export function activeStage(stages: JourneyStage[]): JourneyStage | null {
  return stages.find((s) => s.state === "ACTIVE") ?? null;
}

/** How far along, for the progress bar. */
export function journeyProgress(stages: JourneyStage[]): { done: number; total: number } {
  return { done: stages.filter((s) => s.state === "DONE").length, total: stages.length };
}

/** Everything done, nothing left — the moment to say goodbye properly. */
export function journeyComplete(stages: JourneyStage[]): boolean {
  return stages.every((s) => s.state === "DONE");
}

/**
 * Whether a stage's controls may be shown at all.
 *
 * A finished stage puts its controls away; a locked one never had them. This is
 * the single question the confirmation screen asks before rendering anything
 * interactive, so no card can outlive its moment.
 */
export function stageOpen(stages: JourneyStage[], key: JourneyKey): boolean {
  return stages.find((s) => s.key === key)?.state === "ACTIVE";
}
