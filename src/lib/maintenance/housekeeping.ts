import "server-only";

import { prisma } from "@/lib/prisma";
import { pruneRateLimits } from "@/lib/security/rateLimit";
import { retentionCutoff } from "@/lib/ai/assistant/memory";

/**
 * The nightly tidy-up, which until now nobody performed.
 *
 * ## Why this file exists
 *
 * `RateLimitHit`'s own schema comment reads *"Rows are pruned by the nightly
 * housekeeping, so this never grows without bound."* There was no nightly
 * housekeeping. `pruneRateLimits` was written, exported, and had **zero callers
 * anywhere in the codebase.**
 *
 * That is not a tidiness problem, it is a slow failure with a nasty shape.
 * Every rate-limited action — every order, every upload, every signup, every
 * assistant question — writes a row, and the limiter's own check is a `count()`
 * over that table. As the table grows the count gets slower; and because
 * `checkRateLimit` **deliberately fails open** when the database is unhappy, the
 * end state is not an error anybody sees. It is rate limiting quietly ceasing
 * to work, on a growing table, with every screen looking normal.
 *
 * This is the fifth time in this codebase that something was written, proved,
 * and never called. So it is worth stating the general rule rather than only
 * fixing the instance: **a comment describing behaviour is not behaviour.** The
 * check for this one is `scripts/verify-housekeeping.ts`, which asserts that
 * every job named here is actually reachable from the cron route.
 *
 * ## What it does not do
 *
 * It never deletes anything operational. Orders, payments, customers, ledgers
 * and audit rows are all untouched — those are the record of a business and
 * some of them are money. Only three things are swept, and each is either a
 * counter that has expired or data we told somebody we would not keep.
 */

export interface HousekeepingResult {
  /** Expired rate-limit counters. */
  rateLimitHits: number;
  /** Assistant turns past the 30 days the privacy page promises. */
  assistantTurns: number;
  /** Anything that failed, named. Never thrown — a tidy-up must not page anyone. */
  problems: string[];
}

export async function runHousekeeping(): Promise<HousekeepingResult> {
  const problems: string[] = [];

  const rateLimitHits = await pruneRateLimits(24).catch((e) => {
    problems.push(`rate limits: ${String(e)}`);
    return 0;
  });

  /*
   * The privacy page says we keep an assistant conversation for 30 days so it
   * can follow on. The route already trims a customer's own old turns when they
   * next speak — but somebody who stops using the assistant never triggers
   * that, and their conversation would sit there indefinitely. A promise about
   * retention has to hold for the people who left, not only the ones who came
   * back.
   */
  const assistantTurns = await prisma.assistantTurn
    .deleteMany({ where: { createdAt: { lt: retentionCutoff() } } })
    .then((r) => r.count)
    .catch((e) => {
      problems.push(`assistant turns: ${String(e)}`);
      return 0;
    });

  /*
   * Push subscriptions are deliberately NOT swept here.
   *
   * The obvious sweep — delete anything older than N months — would silently
   * unsubscribe a dispatcher who has had the console installed since launch and
   * never reinstalled it, which is exactly the person who most needs to be woken
   * at 1 AM. `sendPush` already deletes a subscription the moment a provider
   * answers 404 or 410, which is the only signal that actually means dead.
   */

  return { rateLimitHits, assistantTurns, problems };
}
