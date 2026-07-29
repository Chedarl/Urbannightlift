import "server-only";

import crypto from "node:crypto";

/**
 * A link that lets somebody you trust watch you get home.
 *
 * A woman ordering alone at 1 AM is the customer this business is actually
 * for, and the thing she wants is not a better map — it is for one other
 * person to be able to see where the rider is and when she is home. Nobody
 * else in this market offers that.
 *
 * The link therefore has to be safe to paste into a group chat that the
 * customer does not control. It is signed, it expires, and it carries the
 * order code and nothing else. What the watcher can see is decided entirely by
 * the page that reads it: the rider's position, the ETA and the status. Never
 * the delivery OTP, never a phone number, never the street address — the
 * public `GET /api/track/[orderCode]` already returns exactly that much and no
 * more, which is why it is the right source and no new surface is needed.
 *
 * The forwarding risk is the whole design problem. A watch link is expected to
 * be forwarded — that is its purpose — so it is built assuming it will end up
 * somewhere unintended, and simply contains nothing worth stealing.
 */

/** Long enough to cover a slow night; short enough that a forwarded link dies. */
const DEFAULT_TTL_MS = 6 * 60 * 60_000;
/** After the goods are in hand, a watcher has no reason to keep watching. */
export const AFTER_DELIVERY_GRACE_MS = 60 * 60_000;

function secret(): string {
  return (
    process.env.WATCH_LINK_SECRET ||
    process.env.ORDER_ACCESS_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.DATABASE_URL ||
    "unl-dev-watch-link-secret"
  );
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export interface WatchClaim {
  /** The order being watched. */
  code: string;
  /** Unix milliseconds after which this link is dead. */
  exp: number;
}

/**
 * Mints a link for one order.
 *
 * The expiry is inside the signature, so it cannot be pushed out by editing the
 * URL — a link that could be extended by whoever holds it is not an expiring
 * link at all.
 */
export function createWatchToken(orderCode: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const claim: WatchClaim = { code: orderCode.toUpperCase(), exp: Date.now() + ttlMs };
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Reads a token, or null if it was forged, mangled or has expired. */
export function readWatchToken(token: string, now: Date = new Date()): WatchClaim | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(sign(payload), signature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed?.code !== "string" || typeof parsed?.exp !== "number") return null;
    if (parsed.exp <= now.getTime()) return null;
    return { code: parsed.code, exp: parsed.exp };
  } catch {
    return null;
  }
}

/**
 * Whether a watcher should still be shown anything.
 *
 * A valid token is not enough on its own: once the goods are in hand the
 * watching is over, and a link that outlives the delivery is a link that keeps
 * broadcasting somebody's movements for no reason. An hour of grace covers the
 * friend who opens it just after the knock.
 */
export function watchWindowOpen(
  o: { customerConfirmedAt: Date | null; completedAt: Date | null; orderStatus: string },
  now: Date = new Date()
): boolean {
  const stopped = ["CANCELLED_BY_CUSTOMER", "CANCELLED_BY_UNL", "REJECTED", "REFUNDED"].includes(o.orderStatus);
  if (stopped) return false;

  const ended = o.customerConfirmedAt ?? o.completedAt;
  if (!ended) return true;
  return now.getTime() - ended.getTime() <= AFTER_DELIVERY_GRACE_MS;
}

/** The full URL to send. Built from the canonical domain, never a preview host. */
export function watchUrl(token: string, origin?: string): string {
  const base = (origin || process.env.NEXT_PUBLIC_SITE_URL || "https://urbannighlift.com").replace(/\/+$/, "");
  return `${base}/w/${token}`;
}
