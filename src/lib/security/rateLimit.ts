import "server-only";

import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";

/**
 * A limit on what a stranger can do, on the forms that have no account behind
 * them.
 *
 * ## Why this exists
 *
 * `account/signup`, `support`, `service-interest`, `merchant-signup`,
 * `rider-applications`, `POST /api/orders` and `POST /api/upload` could all be
 * called without limit by anyone. Two earlier rounds wrote down that the signup
 * forms would get a honeypot and a per-hour cap; a `grep` for `honeypot` across
 * the whole API returned nothing. It was planned twice and built neither time.
 *
 * Nothing is *stolen* by scripting those endpoints. What happens instead is
 * that the case inbox and the needs-attention queue fill with rubbish — and
 * those are the two screens the business is actually run from at 1 AM. A queue
 * nobody can trust is the same as no queue.
 *
 * ## The Yaoundé constraint, which decides the numbers
 *
 * **Limits here are deliberately generous.** Mobile data in Cameroon puts a
 * great many real customers behind a small number of carrier NAT addresses, so
 * a tight per-IP limit does not block an attacker — it blocks a street of
 * paying customers who happen to share an exit node. Every limit below is set
 * where a human being could never reach it and a script reaches it quickly.
 *
 * If a limit is ever wrong, it should be wrong in the direction of letting an
 * abuser through, because the other direction silently loses orders.
 *
 * ## What is stored
 *
 * **The IP is hashed, never kept.** An address plus a timestamp plus a purpose
 * is a record of who was doing what and when, which is a tracking surface we
 * have no reason to hold — and this product's privacy page is specific about
 * what is kept. A salted SHA-256 answers "is this the same caller as a minute
 * ago" and answers nothing else.
 */

/** Where a caller sits, as far as a proxy will tell us. */
export function callerIp(req: Request): string {
  const headers = req.headers;
  // Vercel sets `x-forwarded-for` as a comma-separated chain; the first entry
  // is the original client. `x-real-ip` is the fallback for other proxies.
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * A stable, non-reversible handle for a caller.
 *
 * Salted with a server secret so the table cannot be turned back into a list of
 * addresses by anybody who obtains a copy of it — a rainbow table over the
 * whole IPv4 space is otherwise trivial.
 */
function subjectOf(ip: string): string {
  const salt =
    process.env.RATE_LIMIT_SALT ||
    process.env.CUSTOMER_SESSION_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.DATABASE_URL ||
    "unl-dev-rate-limit-salt";
  return crypto.createHmac("sha256", salt).update(ip).digest("base64url").slice(0, 32);
}

export interface Limit {
  /** How many attempts are allowed in the window. */
  max: number;
  /** How long the window is, in minutes. */
  windowMinutes: number;
}

/**
 * The limits, in one place so they can be read side by side and argued about.
 *
 * Each is set at roughly ten times what the most enthusiastic real person could
 * do, for the reason in the module note above.
 */
export const LIMITS: Record<string, Limit> = {
  /** Creating accounts. A family sharing a phone might make three. */
  signup: { max: 20, windowMinutes: 60 },
  /** Help-centre messages. Somebody genuinely upset might send five. */
  support: { max: 20, windowMinutes: 60 },
  /** "Tell me when this launches." Nobody needs to say it twice. */
  interest: { max: 15, windowMinutes: 60 },
  /** A business filling in its own page, possibly badly, several times. */
  merchantSignup: { max: 10, windowMinutes: 60 },
  /** Applying to ride. Once, with a few retries on a bad connection. */
  riderApplication: { max: 10, windowMinutes: 60 },
  /**
   * Placing orders. The highest of them all, on purpose: a shared office or a
   * student hall ordering separately through one NAT must never be refused,
   * and an order is the one thing here we actively want.
   */
  order: { max: 40, windowMinutes: 60 },
  /**
   * Reading a typed sentence into a form. Somebody rephrasing because the first
   * reading was wrong is normal and must not be punished for it.
   */
  intake: { max: 30, windowMinutes: 60 },
  /**
   * Minting an upload URL. A guest order can legitimately need several — a
   * payment screenshot, a voice note, a retry after a failed connection — and
   * a merchant joining uploads a logo. Set well above that and far below what
   * would make this worth using as free image hosting.
   */
  upload: { max: 30, windowMinutes: 60 },
};

export interface LimitResult {
  ok: boolean;
  /** How long until they may try again, in minutes. Zero when allowed. */
  retryInMinutes: number;
}

/**
 * Records this attempt and says whether it was one too many.
 *
 * **Never throws, and never blocks on failure.** If the database is unreachable
 * the call is allowed: a rate limiter that takes the whole site down when it
 * cannot reach its table has caused far more damage than the abuse it prevents.
 * The failure mode is deliberately "let them through".
 */
export async function checkRateLimit(
  req: Request,
  purpose: keyof typeof LIMITS | string,
  limit?: Limit
): Promise<LimitResult> {
  const rule = limit ?? LIMITS[purpose];
  if (!rule) return { ok: true, retryInMinutes: 0 };

  const subject = subjectOf(callerIp(req));
  const since = new Date(Date.now() - rule.windowMinutes * 60_000);

  try {
    const used = await prisma.rateLimitHit.count({
      where: { purpose, subject, createdAt: { gte: since } },
    });

    if (used >= rule.max) {
      // The oldest hit still inside the window decides when a slot frees up,
      // so the answer is a real wait rather than a flat "try later".
      const oldest = await prisma.rateLimitHit.findFirst({
        where: { purpose, subject, createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      const freeAt = (oldest?.createdAt.getTime() ?? Date.now()) + rule.windowMinutes * 60_000;
      return {
        ok: false,
        retryInMinutes: Math.max(1, Math.ceil((freeAt - Date.now()) / 60_000)),
      };
    }

    // Recorded after the check, so the attempt that is refused is not itself
    // counted and cannot extend the wait.
    await prisma.rateLimitHit.create({ data: { purpose, subject } });
    return { ok: true, retryInMinutes: 0 };
  } catch {
    return { ok: true, retryInMinutes: 0 };
  }
}

/**
 * The sentence a refused caller reads.
 *
 * Bilingual, because every one of these endpoints is reachable from a
 * French-speaking screen, and a French customer meeting an English refusal is
 * the exact failure `verify-i18n` exists to prevent.
 */
export function limitMessage(result: LimitResult, fr: boolean): string {
  const mins = result.retryInMinutes;
  return fr
    ? `Trop de tentatives. Réessayez dans ${mins} minute${mins === 1 ? "" : "s"}.`
    : `Too many attempts. Please try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
}

/**
 * A field no human ever fills in.
 *
 * The other half of what was promised twice and never built. A bot filling
 * every input it can see submits this one too; a person never sees it. Returns
 * true when the submission should be **silently accepted and discarded** —
 * telling a script it was caught only teaches it to stop filling the field.
 */
export function trippedHoneypot(body: Record<string, unknown>): boolean {
  // `companyWebsite` is the name `/merchant/join` already uses — that form is
  // the one place a honeypot *was* built, and this reads the same field rather
  // than introducing a second convention beside it.
  const value = body.companyWebsite ?? body.company ?? body.website2 ?? body.honeypot;
  return typeof value === "string" && value.trim().length > 0;
}

/** Housekeeping. Anything outside the longest window is dead weight. */
export async function pruneRateLimits(olderThanHours = 24): Promise<number> {
  try {
    const { count } = await prisma.rateLimitHit.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - olderThanHours * 3_600_000) } },
    });
    return count;
  } catch {
    return 0;
  }
}
