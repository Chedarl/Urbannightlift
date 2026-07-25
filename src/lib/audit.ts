import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Append-only record of who changed what.
 *
 * Status changes were already attributed (OrderStatusHistory.changedByUserId)
 * and so was payment verification (Payment.verifiedById), but the staff edit
 * endpoint — delivery fee, rider assignment, notes — recorded nothing at all.
 * A fee could be dropped from 3,000 to 500 XAF and leave no trace of who did
 * it. That is the change most worth being able to prove, so everything
 * privileged now writes here.
 *
 * Rules this module exists to enforce:
 *  - append-only: nothing updates or deletes a log row;
 *  - a log row outlives its subject, so a deleted order is still accountable
 *    (hence entityLabel, which keeps the order code readable afterwards);
 *  - logging must never break the operation it describes — a failed write is
 *    swallowed rather than 500-ing a delivery.
 */

export interface AuditActor {
  /** Staff User.id. Absent for a customer, who has no staff record. */
  id?: string | null;
  fullName: string;
  role: string;
}

/** One changed field, before and after. */
export type AuditChanges = Record<string, { from: unknown; to: unknown }>;

export interface AuditEntry {
  actor: AuditActor | null;
  action: string;
  entityType: "order" | "payment" | "settings" | "user" | "zone" | "merchant";
  entityId: string;
  /** Something human-readable that still means something once the entity is gone. */
  entityLabel?: string | null;
  changes?: AuditChanges;
  reason?: string | null;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actor?.id ?? null,
        actorName: entry.actor?.fullName ?? "System",
        actorRole: entry.actor?.role ?? "SYSTEM",
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        entityLabel: entry.entityLabel ?? null,
        changes: (entry.changes ?? undefined) as Prisma.InputJsonValue | undefined,
        reason: entry.reason ?? null,
      },
    });
  } catch {
    // An audit write must never take down the request it is describing. A lost
    // log line is bad; a dispatcher unable to assign a rider at 1 AM is worse.
  }
}

/**
 * Diffs a set of proposed changes against the current row, keeping only fields
 * that actually moved — so the log reads as a list of real changes rather than
 * a copy of the form that was submitted.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Record<string, unknown>
): AuditChanges {
  const changes: AuditChanges = {};
  for (const [key, next] of Object.entries(after)) {
    const prev = before[key as keyof T];
    // Dates and primitives both compare correctly once serialised.
    const same =
      prev instanceof Date && next instanceof Date
        ? prev.getTime() === next.getTime()
        : prev === next;
    if (!same) changes[key] = { from: prev ?? null, to: next ?? null };
  }
  return changes;
}
