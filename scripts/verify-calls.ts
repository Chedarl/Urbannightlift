/**
 * Proves an in-app call cannot become a leak.
 *
 * The feature exists to get *through* this product's hardest privacy rule
 * rather than around it: the customer is never shown the rider's phone number,
 * and `RiderIdentityCard.tsx` gives the reason — *"a channel we cannot
 * moderate."* A voice call between the two is only an improvement on that if
 * three things hold, and all three are checkable offline:
 *
 *  1. Nobody but the two people on the order can open, join or interfere with
 *     a call.
 *  2. Nothing written down about a call identifies a person or a place.
 *  3. The window a call is possible in is decided per order status, on purpose,
 *     by somebody rather than by a default.
 *
 * What this **cannot** prove is stated here so nobody mistakes a green run for
 * a working feature: that audio flows, that a TURN relay actually relays, that
 * a push rings a locked phone, or that Safari behaves. Those are a two-phone
 * field test in Yaoundé on MTN and Orange.
 *
 * Run: npx tsx scripts/verify-calls.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canCall,
  ringMode,
  CALLABLE_STATUSES,
  GRACE_AFTER_DELIVERED_MINUTES,
  type CanCallInput,
} from "../src/lib/calls/policy";
import {
  callChannelName,
  mintSignalToken,
  tokenHash,
  acceptSignal,
  SIGNAL_KINDS,
} from "../src/lib/calls/channel";
import { callEventDetail, safeReason } from "../src/lib/calls/redact";
import { iceProviderMode, normaliseIceServers, MAX_TTL_SECONDS } from "../src/lib/calls/iceServers";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const NOW = new Date("2026-09-15T01:00:00Z");
const base: CanCallInput = {
  orderStatus: "RIDER_ARRIVED_AT_DELIVERY",
  assignedRiderId: "rider-1",
  riderAcceptedAt: new Date("2026-09-15T00:30:00Z"),
  deliveredAt: null,
  customerConfirmedAt: null,
  party: "CUSTOMER",
  actorId: "cust-1",
  orderCustomerId: "cust-1",
  enabled: true,
  now: NOW,
};

console.log("Every order status is classified, by somebody rather than by default");
{
  /*
    The enum is read out of the schema rather than imported, so this fails when
    a status is added to the database and not to the table — which is the whole
    point of the exhaustive `satisfies`. A blocklist would have opened a voice
    channel on SAFETY_HOLD, the one state where an unmoderated call between two
    people is least wanted.
  */
  const schema = read("prisma/schema.prisma");
  const block = schema.slice(schema.indexOf("enum OrderStatus {"));
  const members = block
    .slice(0, block.indexOf("}"))
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => /^[A-Z_]+$/.test(l));

  check("the schema enum was found", members.length > 10, `got ${members.length}`);
  for (const m of members) {
    check(
      `${m} is decided`,
      Object.prototype.hasOwnProperty.call(CALLABLE_STATUSES, m),
      "a status missing from the table would take a default nobody chose"
    );
  }
  for (const stopped of ["SAFETY_HOLD", "CUSTOMER_UNREACHABLE", "MERCHANT_UNAVAILABLE", "REFUND_PENDING"]) {
    check(
      `${stopped} is not callable`,
      CALLABLE_STATUSES[stopped as keyof typeof CALLABLE_STATUSES] === false,
      "a dispatcher is already working this; a direct line routes around them"
    );
  }
  for (const over of ["CLOSED", "CANCELLED_BY_CUSTOMER", "CANCELLED_BY_UNL", "FAILED_DELIVERY", "REFUNDED", "REJECTED"]) {
    check(
      `${over} is not callable`,
      CALLABLE_STATUSES[over as keyof typeof CALLABLE_STATUSES] === false
    );
  }
}

console.log("\nOnly the two people on the order, and only while it is running");
{
  check("the customer may call", canCall(base).ok);
  check(
    "the assigned rider may call",
    canCall({ ...base, party: "RIDER", actorId: "rider-1" }).ok
  );
  check(
    "another customer may not",
    canCall({ ...base, actorId: "cust-2" }).reason === "NOT_YOUR_ORDER",
    "the identity check is first and cheapest, and must never be skipped"
  );
  check(
    "another rider may not, even on a perfect order",
    canCall({ ...base, party: "RIDER", actorId: "rider-9" }).reason === "NOT_YOUR_ORDER"
  );
  check(
    "nobody may when no rider is assigned",
    canCall({ ...base, assignedRiderId: null }).ok === false
  );
  check(
    "nor when the rider has not accepted the job",
    canCall({ ...base, riderAcceptedAt: null }).reason === "NOT_ACCEPTED",
    "an offered job sitting in a queue is not a relationship"
  );
  check(
    "nor when the owner has switched calling off",
    canCall({ ...base, enabled: false }).reason === "DISABLED"
  );
  check(
    "a safety hold closes it",
    canCall({ ...base, orderStatus: "SAFETY_HOLD" }).reason === "STATUS_CLOSED"
  );
  check(
    "and so does payment, before any rider exists",
    canCall({ ...base, orderStatus: "AWAITING_PAYMENT" }).ok === false
  );
}

console.log("\nThe grace period after delivery is real, and it ends");
{
  const delivered = (minsAgo: number, confirmed: Date | null = null): CanCallInput => ({
    ...base,
    orderStatus: "DELIVERED",
    deliveredAt: new Date(NOW.getTime() - minsAgo * 60_000),
    customerConfirmedAt: confirmed,
  });
  check(
    `callable ${GRACE_AFTER_DELIVERED_MINUTES - 1} minutes after delivery`,
    canCall(delivered(GRACE_AFTER_DELIVERED_MINUTES - 1)).ok,
    "'he left it with the guard, which guard' is a real one-in-the-morning call"
  );
  check(
    `not ${GRACE_AFTER_DELIVERED_MINUTES + 1} minutes after`,
    canCall(delivered(GRACE_AFTER_DELIVERED_MINUTES + 1)).reason === "TOO_LATE"
  );
  check(
    "and not once the customer has confirmed they have it, at any offset",
    [0, 1, 5, 14].every((m) => canCall(delivered(m, NOW)).reason === "TOO_LATE"),
    "confirmed is finished; the window closes on the earlier of the two"
  );
}

console.log("\nA rider in motion is asked, not rung");
{
  /*
    The rider is on a motorbike. Ringing somebody mid-ride is a safety event,
    not a UX event — they either ignore it or they answer it, and the second is
    worse.
  */
  for (const moving of ["RIDER_GOING_TO_PICKUP", "RIDER_GOING_TO_DELIVERY"] as const) {
    check(`${moving} asks for a call back`, ringMode(moving) === "REQUEST_CALLBACK");
  }
  for (const stopped of ["RIDER_ARRIVED_AT_PICKUP", "RIDER_ARRIVED_AT_DELIVERY", "RIDER_ASSIGNED"] as const) {
    check(`${stopped} may ring`, ringMode(stopped) === "RING");
  }
}

console.log("\nThe channel name gives nothing away");
{
  const SECRET = "test-secret-not-the-real-one";
  const orderId = "cmu1r3qy700017db58lgklbwi";
  const orderCode = "UNL-4821";
  const name = callChannelName(orderId, SECRET);

  check("it contains neither the order id nor the order code", !name.includes(orderId) && !name.includes(orderCode),
    "order codes travel through WhatsApp and screenshots; a channel named after one is public");
  check("it is long enough to be unguessable", name.length >= 40, `${name.length} chars`);
  check("the same order always gets the same room", name === callChannelName(orderId, SECRET));
  check(
    "one character of difference gives an unrelated room",
    callChannelName(orderId.slice(0, -1) + "j", SECRET) !== name
  );
  check(
    "and a different secret gives a different room",
    callChannelName(orderId, "another-secret") !== name,
    "otherwise rotating the secret would not actually rotate anything"
  );
}

console.log("\nNo message reaches the peer connection without the token");
{
  const token = mintSignalToken();
  const expect = { callId: "call-1", peerTokenHash: tokenHash(token), seen: 4 };
  const good = { kind: "offer", callId: "call-1", token, seq: 5, payload: { sdp: "x" } };

  check("a genuine message is accepted", acceptSignal(good, expect) !== null);
  check("a wrong token is refused", acceptSignal({ ...good, token: mintSignalToken() }, expect) === null,
    "this is the check that stops an SDP substitution, which is how you would listen in");
  check("a message for another call is refused", acceptSignal({ ...good, callId: "call-2" }, expect) === null);
  check(
    "a replayed sequence is refused",
    acceptSignal({ ...good, seq: 4 }, expect) === null && acceptSignal({ ...good, seq: 1 }, expect) === null,
    "a captured hangup replayed later would end a different call"
  );
  check("an unknown kind is refused", acceptSignal({ ...good, kind: "shutdown" }, expect) === null);
  for (const [label, junk] of [["null", null], ["a string", "offer"], ["an array", []], ["a number", 7]] as const) {
    check(`${label} is refused rather than thrown on`, acceptSignal(junk, expect) === null);
  }
  check(
    "every declared kind is actually accepted",
    SIGNAL_KINDS.every((k, i) => acceptSignal({ ...good, kind: k, seq: 10 + i }, expect) !== null),
    "a kind the sender uses and the receiver drops is a call that hangs"
  );
  check(
    "the hash does not contain the token",
    !tokenHash(token).includes(token.slice(0, 12)),
    "only hashes are stored; a stored token is a stored impersonation"
  );
}

console.log("\nNothing written down identifies a person or a place");
{
  // A real srflx candidate, with a real-shaped Cameroonian public address in it.
  const candidate =
    "candidate:842163049 1 udp 1677729535 41.202.207.12 54321 typ srflx raddr 10.0.2.15 rport 54321";
  const sdp = "v=0\r\no=- 46117317 2 IN IP4 127.0.0.1\r\ns=-\r\na=fingerprint:sha-256 AB:CD\r\n";

  const fromCandidate = callEventDetail({ candidateType: candidate, iceState: "connected" });
  check(
    "a candidate string never survives as a candidate type",
    JSON.stringify(fromCandidate ?? {}).indexOf("41.202.207.12") === -1,
    "an ICE candidate carries both parties' addresses, including the customer's home IP"
  );
  check("but the useful state does", fromCandidate?.iceState === "connected");

  check("the four candidate words are kept", callEventDetail({ candidateType: "relay" })?.candidateType === "relay",
    "relay-versus-srflx is how you tell a TURN misconfiguration from a hostile network");
  check("anything else in that field is dropped", callEventDetail({ candidateType: "192.168.0.1" }) === null);

  check("SDP yields nothing", callEventDetail({ codec: sdp }) === null);
  check("an unknown key is dropped, not passed through", callEventDetail({ evil: "x", homeIp: "41.202.207.12" }) === null,
    "an allowlist fails closed; a redactor fails open the day somebody adds a field");

  for (const phone of ["+237680038004", "237680038004", "680038004", "6 90 11 12 22"]) {
    const out = JSON.stringify(callEventDetail({ codec: phone, iceState: "failed" }) ?? {});
    check(`"${phone}" never lands in a detail`, !out.includes(phone.replace(/\s/g, "")) && !out.includes(phone));
  }

  const REASONS = ["HANGUP", "DECLINED", "TIMEOUT", "ICE_FAILED", "MIC_DENIED", "UNSUPPORTED", "EXPIRED"];
  check("a known end reason is kept", safeReason("ICE_FAILED", REASONS) === "ICE_FAILED");
  check("an invented one is not", safeReason("customer said call 690111222", REASONS) === null,
    "a free-text reason is exactly where a number ends up");
  check("numbers are kept and rounded", callEventDetail({ rttMs: 142.7 })?.rttMs === 143);
  check("a negative is dropped", callEventDetail({ rttMs: -1 }) === null);
}

console.log("\nICE degrades rather than failing, and says which it did");
{
  check("cloudflare wins when configured", iceProviderMode({ CLOUDFLARE_TURN_KEY_ID: "k", CLOUDFLARE_TURN_API_TOKEN: "t" }) === "cloudflare");
  check(
    "and still wins when both are configured",
    iceProviderMode({ CLOUDFLARE_TURN_KEY_ID: "k", CLOUDFLARE_TURN_API_TOKEN: "t", TURN_URLS: "turn:x", TURN_USERNAME: "u", TURN_CREDENTIAL: "c" }) === "cloudflare"
  );
  check("static is the fallback that needs no signup", iceProviderMode({ TURN_URLS: "turn:x", TURN_USERNAME: "u", TURN_CREDENTIAL: "c" }) === "static");
  check("half a static config is not a config", iceProviderMode({ TURN_URLS: "turn:x" }) === "none");
  check("nothing configured is 'none', not a crash", iceProviderMode({}) === "none");

  const cf = normaliseIceServers({
    iceServers: [
      { urls: ["stun:stun.cloudflare.com:3478"] },
      { urls: ["turn:turn.cloudflare.com:3478?transport=udp"], username: "u", credential: "c" },
      { urls: ["turns:turn.cloudflare.com:443?transport=tcp"], username: "u", credential: "c" },
    ],
  });
  check("a real response is relay-capable", cf.relayCapable);
  check(
    "and TLS on 443 is tried first",
    JSON.stringify(cf.iceServers[0].urls).includes(":443"),
    "some Cameroonian APNs block UDP on anything but the usual ports; 443 over TCP is what gets through"
  );

  for (const [label, junk] of [
    ["an empty response", {}],
    ["a null", null],
    ["a string", "turn:everything"],
    ["a list of nonsense", [{ nope: 1 }, null, 7]],
    ["STUN with no TURN", { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }],
  ] as const) {
    const g = normaliseIceServers(junk);
    check(`${label} degrades to STUN-only rather than throwing`, g.relayCapable === false && g.iceServers.length > 0);
    check(`${label} carries no credential`, !JSON.stringify(g.iceServers).includes("credential"));
  }

  check("the TTL cap is short", MAX_TTL_SECONDS <= 600, "a credential is a lease on bandwidth, and a long lease is a standing grant");
  check(
    "and it is enforced in code, not only in the request body",
    /MAX_TTL_SECONDS/.test(read("src/lib/calls/ice.ts").split("body: JSON.stringify")[1] ?? ""),
    "a provider that ignores the body must not be able to hand out an hour"
  );
}

console.log("\nThe modules themselves carry no number and no secret");
{
  for (const f of ["policy.ts", "channel.ts", "redact.ts", "ice.ts"]) {
    const src = read(`src/lib/calls/${f}`);
    check(`${f} has no phone number in it`, !/\+?237\s?\d{6,}/.test(src));
    check(`${f} has no hardcoded credential`, !/(api[_-]?key|secret)\s*[:=]\s*["'][A-Za-z0-9_-]{16,}/i.test(src));
  }
  check(
    "the channel secret is an argument, not an import",
    /secret: string/.test(read("src/lib/calls/channel.ts")),
    "so the suite can prove rotation works without one configured"
  );
}

console.log(
  failures === 0
    ? "\nA call can only be opened by the two people on the order, and leaves nothing behind.\n"
    : `\n${failures} failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
