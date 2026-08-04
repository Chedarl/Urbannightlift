/**
 * What the assistant is allowed to offer, and nothing else.
 *
 * The owner asked for a chat that is *actionable* rather than a talking FAQ,
 * and that is the right instinct — a bot that can only explain is a worse help
 * page. But "actionable" is also where a chatbot becomes dangerous, so the
 * split here is absolute:
 *
 * **The model proposes. It never executes.**
 *
 * Every action it can suggest is one of a fixed list below, each of which maps
 * to a screen or an endpoint this product already has and already guards. The
 * assistant returns a name and a parameter; the interface renders a button; the
 * customer taps it; existing code runs with its existing checks. Nothing new is
 * authorised by the model saying so.
 *
 * `acceptActions` is the gate, and it is the same shape as `acceptAnswer` in
 * `aiResolve.ts`: an id we did not offer is discarded rather than trusted. It
 * has to be, because a model asked to be helpful will happily invent an order
 * code, and an invented order code in a "Track this" button is a customer
 * looking at somebody else's delivery.
 */

export const ACTION_KINDS = [
  /** Open the tracking screen for an order the asker demonstrably owns. */
  "TRACK_ORDER",
  /** Seed a draft from one of their past orders. Never submits it. */
  "REORDER",
  /** Seed the delivery location from one of their saved places. */
  "DELIVER_TO_SAVED",
  /** Open a service's order form. Enabled services only. */
  "START_SERVICE",
  /** Hand off to a person through the existing support case system. */
  "OPEN_CASE",
  /** Show what is trading right now. */
  "SHOW_OPEN_NOW",
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export interface Action {
  kind: ActionKind;
  /** What it acts on: an order code, an address id, a service type. */
  ref: string | null;
  /** The button text, in the language being spoken. */
  label: string;
}

/**
 * What the asker is actually allowed to touch, gathered by the caller from the
 * session — never from anything the model said.
 */
export interface ActionScope {
  /** Order codes this asker owns. Empty for a signed-out visitor. */
  orderCodes: string[];
  /** Saved address ids belonging to this customer. */
  addressIds: string[];
  /** Services switched on right now. */
  services: string[];
  /** Signed-out visitors cannot open a case against an account. */
  signedIn: boolean;
}

const MAX_ACTIONS = 4;

/**
 * Keeps only the actions this asker could legitimately be offered.
 *
 * Three things are checked, and each corresponds to a way this goes wrong:
 *
 *  - **an unknown kind** — the model inventing a capability, e.g. "CANCEL_ORDER"
 *    or "REFUND". Dropped, because the button would be a promise nothing here
 *    can keep.
 *  - **a reference outside the scope** — an order code or address id the asker
 *    does not own. This is the serious one: a plausible-looking code in a
 *    "Track this" button is somebody else's delivery.
 *  - **too many** — a wall of buttons is not a choice. Four.
 */
export function acceptActions(raw: unknown, scope: ActionScope): Action[] {
  if (!Array.isArray(raw)) return [];

  const kinds = new Set<string>(ACTION_KINDS);
  const orders = new Set(scope.orderCodes.map((c) => c.toUpperCase()));
  const addresses = new Set(scope.addressIds);
  const services = new Set(scope.services);

  const out: Action[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    const kind = typeof row.kind === "string" ? row.kind.toUpperCase() : "";
    if (!kinds.has(kind)) continue;

    const ref = typeof row.ref === "string" ? row.ref.trim() : "";
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 60) : "";
    if (!label) continue;

    // The reference must exist in the scope the *caller* built from the
    // session. Nothing here takes the model's word for what somebody owns.
    let accepted: string | null = null;
    switch (kind as ActionKind) {
      case "TRACK_ORDER":
      case "REORDER":
        if (!orders.has(ref.toUpperCase())) continue;
        accepted = ref.toUpperCase();
        break;
      case "DELIVER_TO_SAVED":
        if (!addresses.has(ref)) continue;
        accepted = ref;
        break;
      case "START_SERVICE":
        if (!services.has(ref)) continue;
        accepted = ref;
        break;
      case "OPEN_CASE":
        // A signed-out visitor has no account to attach a case to. They are
        // pointed at the help form instead, which already takes a phone number.
        if (!scope.signedIn) continue;
        accepted = null;
        break;
      case "SHOW_OPEN_NOW":
        accepted = null;
        break;
    }

    const key = `${kind}:${accepted ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ kind: kind as ActionKind, ref: accepted, label });
    if (out.length >= MAX_ACTIONS) break;
  }

  return out;
}

/** Where a button goes. Every one of these routes already exists and is gated. */
export function actionHref(action: Action): string {
  switch (action.kind) {
    case "TRACK_ORDER":
      return `/order/confirmation/${encodeURIComponent(action.ref ?? "")}`;
    case "REORDER":
      return `/account/orders?reorder=${encodeURIComponent(action.ref ?? "")}`;
    case "DELIVER_TO_SAVED":
      return `/order?deliverTo=${encodeURIComponent(action.ref ?? "")}`;
    case "START_SERVICE":
      return `/order/new?service=${encodeURIComponent(action.ref ?? "")}`;
    case "OPEN_CASE":
      return "/help#contact";
    case "SHOW_OPEN_NOW":
      return "/order";
  }
}
