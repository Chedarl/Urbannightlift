import "server-only";

import crypto from "node:crypto";

/**
 * The link that carries somebody's welcome card.
 *
 * Signed and expiring for the same reason the watch link is
 * (`src/lib/orders/watchLink.ts`, whose shape this deliberately copies rather
 * than reinventing): it goes out over WhatsApp, which means it will be
 * forwarded, screenshotted and pasted into places nobody planned. So it is
 * built assuming it ends up somewhere unintended.
 *
 * What it exposes is small and chosen: a name, the night they joined, and their
 * own referral code — which is *meant* to be shared and earns them money when it
 * is. Never a PIN, never an address, never an order. The card is designed to be
 * passed around; that is the point of it.
 *
 * Thirty days, because a welcome that dies in six hours is a welcome nobody
 * gets back to. After that the link is dead and admin can send a fresh one.
 */

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60_000;

function secret(): string {
  return (
    process.env.WELCOME_LINK_SECRET ||
    process.env.WATCH_LINK_SECRET ||
    process.env.ORDER_ACCESS_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.DATABASE_URL ||
    "unl-dev-welcome-link-secret"
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

export type WelcomeKind = "customer" | "merchant";

export interface WelcomeClaim {
  kind: WelcomeKind;
  /** Customer.id or Merchant.id. */
  id: string;
  /** Unix milliseconds after which this link is dead. */
  exp: number;
}

/**
 * Mints a link for one account.
 *
 * The expiry lives inside the signature, so it cannot be pushed out by editing
 * the URL — a link whose holder can extend it is not an expiring link.
 */
export function createWelcomeToken(
  kind: WelcomeKind,
  id: string,
  ttlMs: number = DEFAULT_TTL_MS
): string {
  const claim: WelcomeClaim = { kind, id, exp: Date.now() + ttlMs };
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Reads a token, or null if it was forged, mangled or has expired. */
export function readWelcomeToken(token: string, now: Date = new Date()): WelcomeClaim | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(sign(payload), signature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (parsed?.kind !== "customer" && parsed?.kind !== "merchant") return null;
    if (typeof parsed?.id !== "string" || typeof parsed?.exp !== "number") return null;
    if (parsed.exp <= now.getTime()) return null;
    return { kind: parsed.kind, id: parsed.id, exp: parsed.exp };
  } catch {
    return null;
  }
}

/** The full URL to send. Built from the canonical domain, never a preview host. */
export function welcomeUrl(token: string, origin?: string): string {
  const base = (origin || process.env.NEXT_PUBLIC_SITE_URL || "https://urbannighlift.com").replace(
    /\/+$/,
    ""
  );
  return `${base}/welcome/${token}`;
}
