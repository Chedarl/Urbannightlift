/**
 * What the staff assistant may offer a dispatcher, and nothing else.
 *
 * The customer assistant only ever proposes navigation — a tracking screen, a
 * pre-filled form. This one proposes **mutations**: verify a business, put a
 * rider on an order, resolve a case. That is a different order of risk, so the
 * rule that makes it safe has to be stated rather than assumed:
 *
 * **Every action is a request to an endpoint that already exists, sent by the
 * browser, with the staff session it already has.**
 *
 * Nothing here mints a permission. `PATCH /api/merchants/[id]` still checks
 * `ADMIN_ROLES` and still writes an `AuditLog` row naming the person who
 * pressed the button. A DISPATCHER offered an OWNER-only action gets exactly
 * the 403 they would get on the screen itself, because it is the same endpoint
 * and the same gate. The assistant cannot widen what somebody may do; it can
 * only shorten how far they have to walk to do it.
 *
 * Two consequences worth keeping in mind while reading this file:
 *
 *  - There is deliberately **no server-side execution path**. The route returns
 *    a description of a button. If this module were ever changed to call the
 *    endpoints itself, it would be running as whoever the assistant is, and the
 *    guarantee above would quietly stop being true.
 *  - The reference must exist in the **scope the caller built from its own
 *    queries** — never from anything the model said. A model asked to be helpful
 *    will happily invent an order id, and an invented id in a "put Jean on this"
 *    button is a rider dispatched to the wrong customer.
 */

export const STAFF_ACTION_KINDS = [
  /** Open an order in the admin view. */
  "OPEN_ORDER",
  /** Open a merchant's row. */
  "OPEN_MERCHANT",
  /** Open a support case. */
  "OPEN_CASE",
  /** Open a customer's record. */
  "OPEN_CUSTOMER",
  /** Mark a merchant verified. `PATCH /api/merchants/[id]` — ADMIN_ROLES, audited. */
  "VERIFY_MERCHANT",
  /** Re-stamp `lastConfirmedAt`. Same endpoint, same gate. */
  "CONFIRM_TRADING",
  /** Put a rider on an order. `PATCH /api/orders/[id]` — ADMIN_ROLES, audited. */
  "ASSIGN_RIDER",
  /** Close a case out. `PATCH /api/support/[id]` — ADMIN_ROLES, audited. */
  "RESOLVE_CASE",
] as const;

export type StaffActionKind = (typeof STAFF_ACTION_KINDS)[number];

/** Which of them change something. Rendered differently, and confirmed first. */
const MUTATIONS = new Set<StaffActionKind>([
  "VERIFY_MERCHANT",
  "CONFIRM_TRADING",
  "ASSIGN_RIDER",
  "RESOLVE_CASE",
]);

export function isMutation(kind: StaffActionKind): boolean {
  return MUTATIONS.has(kind);
}

export interface StaffAction {
  kind: StaffActionKind;
  /** What it acts on: an order id, a merchant id, a case id, a customer id. */
  ref: string | null;
  /** For ASSIGN_RIDER only: which rider. Checked against the on-shift list. */
  riderId?: string | null;
  label: string;
}

/**
 * What this dispatcher's screen is actually looking at, gathered by the caller.
 *
 * Everything the model may reference has to appear in one of these lists, which
 * is why they are ids rather than names: a name is ambiguous and a model will
 * cheerfully resolve the ambiguity in whichever direction sounds most helpful.
 */
export interface StaffScope {
  orderIds: string[];
  merchantIds: string[];
  caseIds: string[];
  customerIds: string[];
  riderIds: string[];
}

const MAX_ACTIONS = 4;

/** Keeps only the actions this dispatcher could legitimately be offered. */
export function acceptStaffActions(raw: unknown, scope: StaffScope): StaffAction[] {
  if (!Array.isArray(raw)) return [];

  const kinds = new Set<string>(STAFF_ACTION_KINDS);
  const orders = new Set(scope.orderIds);
  const merchants = new Set(scope.merchantIds);
  const cases = new Set(scope.caseIds);
  const customers = new Set(scope.customerIds);
  const riders = new Set(scope.riderIds);

  const out: StaffAction[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    const kind = typeof row.kind === "string" ? row.kind.toUpperCase() : "";
    if (!kinds.has(kind)) continue;

    const ref = typeof row.ref === "string" ? row.ref.trim() : "";
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 60) : "";
    if (!label) continue;

    let riderId: string | null = null;
    switch (kind as StaffActionKind) {
      case "OPEN_ORDER":
      case "ASSIGN_RIDER":
        if (!orders.has(ref)) continue;
        break;
      case "OPEN_MERCHANT":
      case "VERIFY_MERCHANT":
      case "CONFIRM_TRADING":
        if (!merchants.has(ref)) continue;
        break;
      case "OPEN_CASE":
      case "RESOLVE_CASE":
        if (!cases.has(ref)) continue;
        break;
      case "OPEN_CUSTOMER":
        if (!customers.has(ref)) continue;
        break;
    }

    if (kind === "ASSIGN_RIDER") {
      const proposed = typeof row.riderId === "string" ? row.riderId.trim() : "";
      // No rider, no assignment. "Assign somebody" is not an action, it is a
      // wish, and a button that guesses which rider is worse than no button.
      if (!riders.has(proposed)) continue;
      riderId = proposed;
    }

    const key = `${kind}:${ref}:${riderId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ kind: kind as StaffActionKind, ref: ref || null, riderId, label });
    if (out.length >= MAX_ACTIONS) break;
  }

  return out;
}

/**
 * The request a button makes. Navigation returns a link; a mutation returns the
 * endpoint that already exists, with the body it already accepts.
 *
 * Kept here rather than in the component so that the whole surface — what may
 * be proposed, and exactly what it does — can be read in one file and proved in
 * one script.
 */
export type StaffRequest =
  | { type: "link"; href: string }
  | { type: "request"; method: "PATCH"; url: string; body: Record<string, unknown>; confirm: string };

export function staffRequest(action: StaffAction): StaffRequest {
  const ref = encodeURIComponent(action.ref ?? "");
  switch (action.kind) {
    case "OPEN_ORDER":
      return { type: "link", href: `/admin/orders/${ref}` };
    case "OPEN_MERCHANT":
      return { type: "link", href: `/admin/merchants?open=${ref}` };
    case "OPEN_CASE":
      return { type: "link", href: `/admin/support?case=${ref}` };
    case "OPEN_CUSTOMER":
      return { type: "link", href: `/admin/customers/${ref}` };
    case "VERIFY_MERCHANT":
      return {
        type: "request",
        method: "PATCH",
        url: `/api/merchants/${ref}`,
        body: { verified: true },
        confirm: "Mark this business verified? Customers will start seeing it.",
      };
    case "CONFIRM_TRADING":
      return {
        type: "request",
        method: "PATCH",
        url: `/api/merchants/${ref}`,
        body: { stillTrading: true },
        confirm: "Confirm this business is still trading?",
      };
    case "ASSIGN_RIDER":
      return {
        type: "request",
        method: "PATCH",
        url: `/api/orders/${ref}`,
        body: { assignedRiderId: action.riderId },
        confirm: "Put this rider on the order?",
      };
    case "RESOLVE_CASE":
      return {
        type: "request",
        method: "PATCH",
        url: `/api/support/${ref}`,
        body: { status: "RESOLVED" },
        confirm: "Mark this case resolved?",
      };
  }
}
