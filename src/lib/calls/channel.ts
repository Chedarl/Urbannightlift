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
 * ## The per-call secret is the second
 *
 * A channel name is a capability, and capabilities leak. So every message also
 * carries a secret minted for that one call and handed only to the two parties
 * the policy authorised. `acceptSignal` — in `signal.ts`, because it has to run
 * in a browser — is the single place inbound messages are judged, and a message
 * that fails it never reaches the peer connection.
 *
 * That closes the attack the channel name alone does not: somebody who somehow
 * learned the name can still neither ring, nor answer, nor inject an SDP (which
 * is how you would substitute a DTLS fingerprint and listen in), nor hang up a
 * call in progress.
 *
 * Secrets are 32 random bytes, live only as long as the call, and only their
 * hashes are written down — a stored secret is a stored impersonation.
 *
 * ## Why validation is not in this file
 *
 * It reads well next to the minting and it cannot ship there: this module needs
 * `node:crypto`, and the judging happens in both browsers. See `signal.ts`.
 */

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

/**
 * The secret both sides of one call authenticate their messages with.
 *
 * ## Why it is derived rather than minted
 *
 * The first version minted 32 random bytes at `invite` and stored only a hash.
 * That made a working two-party call **impossible**: only the caller calls
 * `invite`, so the answerer had no way to ever learn the value — and a
 * `verify-calls` assertion was actively enforcing that, on the reasoning that
 * "two ways to obtain it is one too many". The reasoning was wrong. Both ways
 * sit behind the same `authoriseCall`, and the answerer has no other path.
 *
 * Deriving it fixes that without storing a secret at rest at all. Both routes
 * compute the same value on demand from the server-held channel secret and the
 * call id — exactly the construction `callChannelName` already uses, and as
 * unguessable for the same reason.
 *
 * Rotating `CALL_CHANNEL_SECRET` invalidates calls in flight. For a value whose
 * useful life is one conversation, that is the right trade.
 */
export function callSecret(callId: string, channelSecret: string): string {
  return crypto.createHmac("sha256", channelSecret).update(`secret:${callId}`).digest("base64url");
}

/**
 * A fingerprint safe to store beside a call row.
 *
 * Kept for the audit trail — it proves after the fact that a given secret
 * belonged to a given call, and is useless for producing one. Nothing
 * authenticates against it; `acceptSignal` compares the derived value directly.
 */
export function secretHash(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("base64url");
}
