import "server-only";

import crypto from "node:crypto";

/**
 * A link a restaurant can tap to say what they actually have.
 *
 * The ping goes out over WhatsApp, and a `wa.me` link cannot receive a reply —
 * it opens WhatsApp with the message typed and the answer comes back to
 * whoever's phone sent it. So the message carries this link as the second way
 * in: tap it, type one line, done, with nobody in the middle.
 *
 * Modelled directly on `src/lib/orders/watchLink.ts`, which solved the same
 * problem for a different audience: a URL that has to work with no login, be
 * safe to sit in a chat thread, and stop working on its own.
 *
 * **What it is worth stealing is deliberately almost nothing.** The page behind
 * it shows a business's own dish names and lets them mark items in or out. No
 * customer data, no orders, no money, no login. The worst a leaked link can do
 * is mark that one restaurant's food unavailable until the next ping — visible
 * immediately on the admin screen, and undone in one tap.
 *
 * It expires in a night, because availability is a fact about tonight.
 */

/** One trading night. Availability tomorrow is a different question. */
const DEFAULT_TTL_MS = 14 * 60 * 60_000;

function secret(): string {
  return (
    process.env.MERCHANT_PING_SECRET ||
    process.env.WATCH_LINK_SECRET ||
    process.env.ORDER_ACCESS_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.DATABASE_URL ||
    "unl-dev-merchant-ping-secret"
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

export interface PingClaim {
  /** The merchant answering. */
  m: string;
  /** The ping this answers, so a reply is attached to the ask that prompted it. */
  p: string;
  /** Unix milliseconds after which the link is dead. */
  exp: number;
}

/**
 * Mints a link for one ping to one merchant.
 *
 * The expiry is inside the signature, so it cannot be pushed out by editing the
 * URL — a link that can be extended by whoever holds it is not expiring at all.
 */
export function createPingToken(merchantId: string, pingId: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const claim: PingClaim = { m: merchantId, p: pingId, exp: Date.now() + ttlMs };
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Reads a token, or null if it was forged, mangled or has expired. */
export function readPingToken(token: string, now: Date = new Date()): PingClaim | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(sign(payload), signature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed?.m !== "string" || typeof parsed?.p !== "string") return null;
    if (typeof parsed?.exp !== "number" || parsed.exp <= now.getTime()) return null;
    return { m: parsed.m, p: parsed.p, exp: parsed.exp };
  } catch {
    return null;
  }
}

/** The full URL to send. Canonical domain, never a preview host. */
export function pingUrl(token: string, origin?: string): string {
  const base = (origin || process.env.NEXT_PUBLIC_SITE_URL || "https://urbannighlift.com").replace(/\/+$/, "");
  return `${base}/m/${token}`;
}

/**
 * What we actually send them.
 *
 * Written the way somebody would text a business they know: short, French
 * first because most kitchens here answer in French, and it says how to reply
 * both ways. A restaurant should be able to answer without opening anything.
 */
export function pingMessage(merchantName: string, url: string, askForMenu = false): string {
  /*
   * Two different questions, because a business with nothing listed cannot
   * answer the first one.
   *
   * "What ran out tonight?" needs a menu to run out of. Sent to a merchant we
   * have just verified, it is unanswerable — and refusing to send it at all is
   * what left new businesses sitting empty, since the only way to get a menu is
   * to ask for one. So the first ping asks for the menu, and every ping after
   * that asks what is on the fire.
   */
  if (askForMenu) {
    return `Bonsoir ${merchantName} 👋 Urban Night Lift.

Qu'est-ce que vous vendez ce soir, et à quel prix ? Répondez ici — par exemple « gâteau chocolat 5000, croissant 500 ».

Ou touchez ce lien pour le faire vous-même : ${url}

Nous le mettons sur votre page tout de suite. Merci !`;
  }

  return `Bonsoir ${merchantName} 👋 Urban Night Lift.

Qu'est-ce que vous avez ce soir ? Répondez ici en un mot — par exemple « on a tout » ou « plus de poisson braisé ».

Ou touchez ce lien pour le faire vous-même : ${url}

Merci !`;
}
