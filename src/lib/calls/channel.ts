import crypto from "node:crypto";

/**
 * How two browsers find each other without either learning a number.
 *
 * ## The channel name is the first lock
 *
 * Signalling rides Supabase Realtime Broadcast on a channel named
 * `HMAC-SHA256(secret, orderId)`. Two properties matter and both are the reason
 * it is not simply the order code:
 *
 * **It is not derivable.** Order codes travel through WhatsApp, PDFs and
 * screenshots — `orderAccess.ts` exists precisely because a code is not proof
 * of anything. A channel named after one would let anybody who had seen a
 * screenshot listen to the signalling for that delivery.
 *
 * **It is not guessable.** Order ids are cuids and the secret is server-held,
 * so the name is 256 bits of nothing you can work out from the outside.
 *
 * ## The token pair is the second
 *
 * A channel name is a capability, and capabilities leak. So every message also
 * carries a token, and each side was independently told the *hash* of the
 * other's. `acceptSignal` is the single place inbound messages are judged, and
 * a message that fails it never reaches the peer connection.
 *
 * That closes the attack the channel name alone does not: somebody who
 * somehow learned the name can still neither ring, nor answer, nor inject an
 * SDP (which is how you would substitute a DTLS fingerprint and listen in),
 * nor hang up a call in progress.
 *
 * Tokens are 32 random bytes, live for sixty seconds, and only their hashes are
 * ever written down — a stored token is a stored impersonation.
 */

export const SIGNAL_KINDS = [
  "ring",
  "answer",
  "decline",
  "offer",
  "sdp-answer",
  "candidate",
  "hangup",
] as const;

export type SignalKind = (typeof SIGNAL_KINDS)[number];

export interface SignalMessage {
  kind: SignalKind;
  callId: string;
  token: string;
  /** Monotonic per sender. Replays and reorderings are dropped. */
  seq: number;
  /** SDP or an ICE candidate. Opaque here — never logged, never stored. */
  payload?: unknown;
}

/**
 * The room these two share, named so that nobody else can find it.
 *
 * Takes the secret as an argument rather than reading the environment, so the
 * suite can prove the name changes with it without needing one configured.
 */
export function callChannelName(orderId: string, secret: string): string {
  const mac = crypto.createHmac("sha256", secret).update(`call:${orderId}`).digest("base64url");
  return `unl-call-${mac}`;
}

/** 32 random bytes. Goes to one browser and is never written down. */
export function mintSignalToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** What the *other* side is told, so it can recognise a genuine message. */
export function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

/**
 * The one gate every inbound broadcast passes through.
 *
 * Returns the message or null — never throws, because this runs on whatever a
 * hostile client felt like sending and an exception here would take the call
 * down rather than the message.
 *
 * `seen` is the caller's record of the peer's highest accepted `seq`. Anything
 * at or below it is a replay: re-sending a captured `hangup` would otherwise
 * end a later call, and re-sending an `offer` would restart a negotiation
 * mid-conversation.
 */
export function acceptSignal(
  raw: unknown,
  expect: { callId: string; peerTokenHash: string; seen: number }
): SignalMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;

  if (typeof m.kind !== "string" || !(SIGNAL_KINDS as readonly string[]).includes(m.kind)) return null;
  if (m.callId !== expect.callId) return null;
  if (typeof m.seq !== "number" || !Number.isFinite(m.seq) || m.seq <= expect.seen) return null;
  if (typeof m.token !== "string" || m.token.length === 0) return null;

  /*
    Constant-time, because this comparison decides whether a stranger may speak
    on the call. A length-dependent early return is a timing oracle on the
    token, and the token is the only thing standing between the channel name
    and the peer connection.
  */
  if (!safeEqual(tokenHash(m.token), expect.peerTokenHash)) return null;

  return {
    kind: m.kind as SignalKind,
    callId: expect.callId,
    token: m.token,
    seq: m.seq,
    payload: m.payload,
  };
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
