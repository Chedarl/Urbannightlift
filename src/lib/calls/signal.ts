/**
 * What a browser will accept off the signalling channel.
 *
 * ## Why this is separate from `channel.ts`
 *
 * `channel.ts` mints things and needs `node:crypto`, so it is server-only. This
 * runs in **both** browsers — judging every inbound broadcast before it reaches
 * a peer connection — so it has to be free of Node builtins and synchronous.
 * The first draft put `acceptSignal` in `channel.ts` next to the minting, which
 * reads well and cannot ship: `crypto.createHash` does not exist in a browser,
 * and the Web Crypto equivalent is async, which a message handler in the middle
 * of an ICE negotiation is not.
 *
 * ## The secret, and what it does and does not protect
 *
 * One secret per call, minted server-side, handed to exactly the two parties
 * the policy authorised. Every message carries it. A third party who somehow
 * learned the channel name still cannot ring, answer, inject an SDP — which is
 * how you would substitute a DTLS fingerprint and listen in — or hang up a call
 * in progress.
 *
 * What it deliberately does **not** do is stop the two parties impersonating
 * each other, because they are the only two people on the call and "the rider
 * sent a message claiming to be the customer" on a two-party line is not a
 * threat worth a round of asynchronous hashing in the hot path. An earlier
 * draft used a token pair with hashes for exactly that, and bought nothing this
 * product needs.
 *
 * `from` exists so each side ignores its own broadcasts, which Supabase echoes
 * back by default. That is housekeeping, not security, and is checked as such.
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

export type SignalParty = "CUSTOMER" | "RIDER";

export interface SignalMessage {
  kind: SignalKind;
  callId: string;
  /** The per-call secret. Proof that the sender was authorised by the server. */
  secret: string;
  /** Who sent it, so a side can drop the echo of its own message. */
  from: SignalParty;
  /** Monotonic per sender. Replays and reorderings are dropped. */
  seq: number;
  /** SDP or an ICE candidate. Opaque here — never logged, never stored. */
  payload?: unknown;
}

export interface AcceptExpectation {
  callId: string;
  /** What this side was given. Compared in constant time. */
  secret: string;
  /** This side's own party, so its own echoes are dropped. */
  self: SignalParty;
  /** The highest `seq` already accepted from the peer. */
  seen: number;
}

/**
 * The one gate every inbound broadcast passes through.
 *
 * Returns the message or null — never throws, because this runs on whatever a
 * hostile client felt like sending, and an exception here would take the call
 * down rather than the message.
 *
 * `seen` is this side's record of the peer's highest accepted `seq`. Anything
 * at or below it is a replay: re-sending a captured `hangup` would otherwise
 * end a later call, and re-sending an `offer` would restart a negotiation
 * mid-conversation.
 */
export function acceptSignal(raw: unknown, expect: AcceptExpectation): SignalMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;

  if (typeof m.kind !== "string" || !(SIGNAL_KINDS as readonly string[]).includes(m.kind)) return null;
  if (m.callId !== expect.callId) return null;
  if (m.from !== "CUSTOMER" && m.from !== "RIDER") return null;
  // Our own echo. Not an attack, and not something to hand to the peer
  // connection — an offer answered by the side that made it is a deadlock.
  if (m.from === expect.self) return null;
  if (typeof m.seq !== "number" || !Number.isFinite(m.seq) || m.seq <= expect.seen) return null;
  if (typeof m.secret !== "string" || m.secret.length === 0) return null;
  if (!constantTimeEqual(m.secret, expect.secret)) return null;

  return {
    kind: m.kind as SignalKind,
    callId: expect.callId,
    secret: expect.secret,
    from: m.from,
    seq: m.seq,
    payload: m.payload,
  };
}

/**
 * Constant-time string comparison, without `node:crypto`.
 *
 * This decides whether a stranger may speak on the call, and a length-dependent
 * early return is a timing oracle on the secret. Comparing every character of
 * the longer of the two and folding the length difference in means the work
 * done does not vary with how much of the secret was guessed correctly.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
