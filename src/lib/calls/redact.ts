/**
 * What may be written down about a call, and nothing else.
 *
 * ## An allowlist, not a redactor
 *
 * This is the important design decision in the file. A redactor strips the bad
 * things out and fails **open** — the day somebody adds a field it did not
 * anticipate, that field is written. An allowlist fails **closed**: the worst a
 * careless edit can do is produce an empty `detail`.
 *
 * The thing being guarded is not hypothetical. An ICE candidate string contains
 * both parties' local *and public* IP addresses, so a call log built by
 * spreading the stats object would quietly accumulate the home IP address of
 * every customer who ever rang a rider, indexed by order.
 *
 * ## What is kept, and why each one earns it
 *
 * The candidate **type** — `host`, `srflx`, `prflx`, `relay` — and not the
 * candidate. That single word is how you tell "TURN is misconfigured" from
 * "this customer's network is hostile", which is the only diagnostic question
 * anybody will actually ask about a failed call.
 *
 * `iceState`, `rttMs`, `codec`, `packetsLost`: the shape of a bad call, with
 * nothing in them that identifies a person or a place.
 *
 * ## What is never kept
 *
 * Audio, or anything derived from it. SDP in any form — it carries the DTLS
 * fingerprint and the candidate list. Either phone number, in any field,
 * including a free-text one. The signalling tokens. TURN credentials.
 *
 * The suite asserts each of those against realistic inputs rather than trusting
 * this comment.
 */

const ALLOWED = ["iceState", "candidateType", "rttMs", "codec", "packetsLost"] as const;

const CANDIDATE_TYPES = new Set(["host", "srflx", "prflx", "relay"]);
const ICE_STATES = new Set(["new", "checking", "connected", "completed", "failed", "disconnected", "closed"]);

/** Cheap shapes that must never survive, checked on every string value. */
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;
const IPV6 = /\b(?:[0-9a-f]{1,4}:){2,}[0-9a-f]{0,4}\b/i;
const SDP_LINE = /^[a-z]=/m;
/** 237 is Cameroon. Matched with or without the prefix, spaced or not. */
const PHONE = /(?:\+?237[\s-]?)?[26]\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}/;

function looksPrivate(v: string): boolean {
  return IPV4.test(v) || IPV6.test(v) || SDP_LINE.test(v) || PHONE.test(v);
}

/**
 * The diagnostic detail for one call event, or null.
 *
 * Null rather than `{}` when nothing survives, so a row with no useful detail
 * is distinguishable from one that was never given any.
 */
export function callEventDetail(raw: unknown): Record<string, string | number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const out: Record<string, string | number> = {};

  for (const key of ALLOWED) {
    const v = input[key];
    if (v == null) continue;

    if (key === "candidateType") {
      // Only the four words. Anything else is a candidate string wearing the
      // wrong key, and a candidate string is two people's IP addresses.
      if (typeof v === "string" && CANDIDATE_TYPES.has(v)) out[key] = v;
      continue;
    }
    if (key === "iceState") {
      if (typeof v === "string" && ICE_STATES.has(v)) out[key] = v;
      continue;
    }
    if (key === "rttMs" || key === "packetsLost") {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[key] = Math.round(v);
      continue;
    }
    if (key === "codec") {
      // A codec name is short and alphanumeric. Anything else is something else.
      if (typeof v === "string" && /^[A-Za-z0-9/_.-]{1,24}$/.test(v) && !looksPrivate(v)) out[key] = v;
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Every way a call is allowed to have ended.
 *
 * Lived only in the suite, which meant the route that writes `endReason` and
 * the test that checks it were each carrying their own idea of what a reason
 * may be — and the route's idea was "whatever the client sent". One list, in
 * the module both of them import.
 */
export const END_REASONS = [
  /** Somebody pressed the red button. */
  "HANGUP",
  /** The other side said no. */
  "DECLINED",
  /** Nobody picked up. */
  "TIMEOUT",
  /** The connection never came up — usually no relay on a hostile network. */
  "ICE_FAILED",
  /** The caller's browser refused the microphone. */
  "MIC_DENIED",
  /** A browser with no WebRTC at all. */
  "UNSUPPORTED",
  /** The window closed underneath it — the order moved on mid-call. */
  "EXPIRED",
] as const;

export type EndReason = (typeof END_REASONS)[number];

/**
 * Whether a string is safe to store on a call row at all.
 *
 * Used for the one free-text field a call has — `endReason` — because a reason
 * is exactly where somebody will one day put "customer said to try 6 90 11 12
 * 22 instead".
 *
 * `allowed` is an argument rather than a closed-over constant so this stays
 * usable for any future field with the same shape, and so the suite can prove
 * it rejects on membership rather than on the specific list.
 */
export function safeReason(reason: unknown, allowed: readonly string[]): string | null {
  if (typeof reason !== "string") return null;
  if (!allowed.includes(reason)) return null;
  if (looksPrivate(reason)) return null;
  return reason;
}
