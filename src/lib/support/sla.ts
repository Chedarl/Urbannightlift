/**
 * How a support desk decides what to answer next.
 *
 * The cases screen listed requests newest-first, which is the wrong order: the
 * request that arrived an hour ago and has never been answered matters more
 * than one that came in thirty seconds ago. A real desk runs on two questions —
 * *is the customer waiting on us?* and *how long have they waited against what
 * we promised?* — and answers the worst breach first.
 *
 * Pure and deterministic, so the queue sorts the same way for everyone and can
 * be tested without a database.
 */

export type CasePriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type CaseStatus = "NEW" | "IN_PROGRESS" | "WAITING_ON_CUSTOMER" | "RESOLVED" | "CLOSED";

/**
 * What we promise ourselves for a first/next reply, by priority — in minutes.
 * Tuned for a night operation: an urgent case at 1 AM cannot sit, but a
 * low-priority question can reasonably wait until the desk clears.
 */
export const RESPONSE_TARGET_MIN: Record<CasePriority, number> = {
  URGENT: 15,
  HIGH: 30,
  NORMAL: 120,
  LOW: 480,
};

const OPEN: CaseStatus[] = ["NEW", "IN_PROGRESS", "WAITING_ON_CUSTOMER"];

export interface CaseInput {
  status: CaseStatus;
  priority: CasePriority;
  createdAt: Date | string;
  lastCustomerMessageAt: Date | string | null;
  lastStaffMessageAt: Date | string | null;
}

function ms(v: Date | string | null): number | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** A case that still needs someone, versus one that is done. */
export function isOpen(status: CaseStatus): boolean {
  return OPEN.includes(status);
}

/**
 * Whose turn it is. The customer is waiting on us when they spoke last, or when
 * the case is brand new and nobody has answered — and never once it is resolved
 * or explicitly parked waiting on them.
 */
export function isWaitingOnUs(c: CaseInput): boolean {
  if (c.status === "RESOLVED" || c.status === "CLOSED" || c.status === "WAITING_ON_CUSTOMER") return false;
  if (c.status === "NEW") return true;
  const cust = ms(c.lastCustomerMessageAt);
  const staff = ms(c.lastStaffMessageAt);
  if (cust == null) return staff == null; // nothing said either way → still ours to open
  if (staff == null) return true; // customer spoke, we never did
  return cust > staff; // whoever spoke last
}

/**
 * Since when the ball has been in our court — the moment the customer last
 * spoke, or the case opened. Null when it is not our turn.
 */
export function waitingSince(c: CaseInput): number | null {
  if (!isWaitingOnUs(c)) return null;
  return ms(c.lastCustomerMessageAt) ?? ms(c.createdAt);
}

/** Minutes the customer has been waiting on us, or null if it is not our turn. */
export function minutesWaiting(c: CaseInput, now: Date = new Date()): number | null {
  const since = waitingSince(c);
  if (since == null) return null;
  return Math.max(0, Math.floor((now.getTime() - since) / 60_000));
}

export type SlaState = "OK" | "DUE_SOON" | "BREACHED" | "IDLE";

/**
 * Where this case stands against its promise.
 *   BREACHED  — we have already missed the target
 *   DUE_SOON  — within the last quarter of the window
 *   OK        — our turn, still comfortably inside the window
 *   IDLE      — not our turn (answered, resolved, or waiting on the customer)
 */
export function slaState(c: CaseInput, now: Date = new Date()): SlaState {
  const waited = minutesWaiting(c, now);
  if (waited == null) return "IDLE";
  const target = RESPONSE_TARGET_MIN[c.priority];
  if (waited >= target) return "BREACHED";
  if (waited >= target * 0.75) return "DUE_SOON";
  return "OK";
}

const RANK: Record<SlaState, number> = { BREACHED: 0, DUE_SOON: 1, OK: 2, IDLE: 3 };

/**
 * Worst first: breached before due-soon before merely-waiting, and within a
 * band the longest wait leads. Open cases always sort above closed ones.
 */
export function bySla<T extends { sla: SlaState; waited: number | null; open: boolean }>(a: T, b: T): number {
  if (a.open !== b.open) return a.open ? -1 : 1;
  const r = RANK[a.sla] - RANK[b.sla];
  if (r !== 0) return r;
  return (b.waited ?? -1) - (a.waited ?? -1);
}

/**
 * A one-line read of the case for the queue, computed once so the list and the
 * detail agree.
 */
export interface CaseRead {
  open: boolean;
  waitingOnUs: boolean;
  waited: number | null;
  sla: SlaState;
  targetMin: number;
}

export function readCase(c: CaseInput, now: Date = new Date()): CaseRead {
  return {
    open: isOpen(c.status),
    waitingOnUs: isWaitingOnUs(c),
    waited: minutesWaiting(c, now),
    sla: slaState(c, now),
    targetMin: RESPONSE_TARGET_MIN[c.priority],
  };
}
