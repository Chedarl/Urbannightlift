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
import { callChannelName, mintCallSecret, secretHash } from "../src/lib/calls/channel";
import { acceptSignal, constantTimeEqual, SIGNAL_KINDS } from "../src/lib/calls/signal";
import { callEventDetail, safeReason, END_REASONS } from "../src/lib/calls/redact";
import { iceProviderMode, normaliseIceServers, MAX_TTL_SECONDS } from "../src/lib/calls/iceServers";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/**
 * The same file with its comments gone.
 *
 * Needed because these files *explain* the rules being checked — `signal.ts`
 * says why `channel.ts` is server-only, `CallSheet.tsx` says why the dispatch
 * line is unconditional — and a check that greps the raw text finds its own
 * prose and reports the rule it describes as broken. This repo has now lost six
 * checks that way; a mention is not a directive.
 */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

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

console.log("\nNo message reaches the peer connection without the call secret");
{
  const secret = mintCallSecret();
  /*
    The customer's side, judging messages from the rider. `self` is what makes
    it drop its own echoes — Supabase broadcasts back to the sender by default,
    and an offer answered by the side that made it is a deadlock rather than an
    attack.
  */
  const expect = { callId: "call-1", secret, self: "CUSTOMER" as const, seen: 4 };
  const good = {
    kind: "offer",
    callId: "call-1",
    secret,
    from: "RIDER" as const,
    seq: 5,
    payload: { sdp: "x" },
  };

  check("a genuine message is accepted", acceptSignal(good, expect) !== null);
  check(
    "a wrong secret is refused",
    acceptSignal({ ...good, secret: mintCallSecret() }, expect) === null,
    "this is the check that stops an SDP substitution, which is how you would listen in"
  );
  check("a message for another call is refused", acceptSignal({ ...good, callId: "call-2" }, expect) === null);
  check(
    "our own echo is dropped",
    acceptSignal({ ...good, from: "CUSTOMER" }, expect) === null,
    "Supabase broadcasts back to the sender; answering your own offer deadlocks the call"
  );
  check("an unknown party is refused", acceptSignal({ ...good, from: "DISPATCH" }, expect) === null);
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
    SIGNAL_KINDS.every((k: string, i: number) => acceptSignal({ ...good, kind: k, seq: 10 + i }, expect) !== null),
    "a kind the sender uses and the receiver drops is a call that hangs"
  );
  check(
    "the stored hash does not contain the secret",
    !secretHash(secret).includes(secret.slice(0, 12)),
    "only hashes are stored; a stored secret is a stored impersonation"
  );

  // The comparison itself, since it is hand-rolled rather than `node:crypto` —
  // `acceptSignal` has to run in a browser, where `timingSafeEqual` does not
  // exist and the Web Crypto equivalent is async.
  check("the comparison agrees with equality", constantTimeEqual(secret, secret));
  check("and disagrees on a one-character difference", !constantTimeEqual(secret, `${secret.slice(0, -1)}!`));
  check("and on a prefix", !constantTimeEqual(secret, secret.slice(0, 10)));
  check("and on empty", !constantTimeEqual(secret, ""));
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

  // The module's own list, not a copy — a suite that restates the constant it
  // is checking proves only that it can be typed twice.
  const REASONS = END_REASONS;
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
  for (const f of ["policy.ts", "channel.ts", "signal.ts", "redact.ts", "ice.ts", "authorise.ts"]) {
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

console.log("\nNo /api/calls response can carry a way to reach somebody");
{
  /*
    The guarantee the whole feature rests on, checked at the boundary where it
    would actually break.

    The modules are careful. A route is where carefulness goes to die: somebody
    adds `customer: { select: { fullName: true, whatsappNumber: true } }` to a
    query because the screen wanted a name, the response spreads the order, and
    the number the product promised never to disclose is in a JSON body that a
    browser console prints.

    So this reads the routes and objects to the *shape*, not to the values.
  */
  const ROUTES = [
    "src/app/api/calls/invite/route.ts",
    "src/app/api/calls/[callId]/answer/route.ts",
    "src/app/api/calls/[callId]/end/route.ts",
    "src/app/api/calls/[callId]/event/route.ts",
  ];

  const FORBIDDEN_KEY = /\b(phone|whatsapp|whatsappNumber|email|fullName|riderName|customerName|number)\s*:/i;
  const CAMEROON = /\+?237\s?\d{6,}/;

  for (const rel of ROUTES) {
    const name = rel.replace("src/app/api/calls/", "");
    const src = read(rel);
    const bare = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

    // Every `NextResponse.json({...})` body in the file, taken together.
    const bodies = [...bare.matchAll(/NextResponse\.json\(([\s\S]*?)\n\s*\)/g)]
      .map((m) => m[1])
      .join("\n");

    check(
      `${name} returns no key that could identify a person`,
      !FORBIDDEN_KEY.test(bodies),
      "a response shape is the easiest place for a number to leak by accident"
    );
    check(`${name} contains no Cameroonian number at all`, !CAMEROON.test(src));
    check(
      `${name} selects no contact column`,
      !/whatsappNumber:\s*true|email:\s*true|fullName:\s*true/.test(bare),
      "if it is never fetched it can never be returned"
    );
  }

  // The two that hand out a live capability must both be gated on the switch
  // and on the policy, through the shared helper rather than by hand.
  for (const rel of ROUTES) {
    const src = read(rel);
    check(
      `${rel.split("/").slice(-2, -1)[0]}/route.ts goes through authoriseCall`,
      src.includes("authoriseCall"),
      "four routes deciding authorisation four ways is how a stranger ends up on a call"
    );
  }

  const invite = read("src/app/api/calls/invite/route.ts");
  check(
    "invite refuses to run without a channel secret",
    /NOT_CONFIGURED/.test(invite),
    "a default secret would put every deployment in one channel namespace"
  );
  check(
    "invite decides the ring mode on the server",
    /ringMode\(/.test(invite),
    "a client that decided this could be told to ring a rider who is mid-ride"
  );
  check(
    "invite is rate limited per caller",
    /checkRateLimit\(req, "call"/.test(invite),
    "the limit here is about not letting somebody use the product to harass the other party"
  );

  const end = read("src/app/api/calls/[callId]/end/route.ts");
  check(
    "ending a call never depends on the order still being callable",
    /auth\.order \|\| !auth\.party/.test(end.replace(/\s+/g, " ")) || /only `party` and `order`/.test(end),
    "an order can be cancelled mid-conversation, and the right answer to hang up is to hang up"
  );
  check(
    "and the end reason comes from the allowlist",
    /safeReason\(body\.reason, END_REASONS\)/.test(end),
    "a free-text reason is exactly where a number ends up"
  );

  const answer = read("src/app/api/calls/[callId]/answer/route.ts");
  check(
    "answering re-checks the order rather than trusting the call id",
    /authoriseCall/.test(answer) && /session\.orderId !== auth\.order\.id/.test(answer),
    "a call id travels through a push notification, which lands on a lock screen"
  );
  check(
    "and does not re-issue the call secret",
    !/\bsecret,/.test(answer.replace(/channelSecret/g, "").replace(/\/\*[\s\S]*?\*\//g, "")),
    "two ways to obtain the thing that authenticates every message is one too many"
  );
}

console.log("\nThe signalling judge runs in a browser, so it uses no Node builtins");
{
  /*
    The first draft put `acceptSignal` next to the minting in `channel.ts`,
    which reads beautifully and cannot ship: `crypto.createHash` does not exist
    in a browser, and the Web Crypto equivalent is async — which a handler in
    the middle of an ICE negotiation is not.
  */
  const signal = read("src/lib/calls/signal.ts");
  /*
    Comments stripped before the `server-only` check, and this is the sixth time
    in this repo that a check has failed on its own prose. `signal.ts` explains
    at the top *why* `channel.ts` is server-only, so grepping the raw file for
    that string finds the sentence describing the rule and reports the rule as
    broken. A mention is not a directive.
  */
  const signalCode = signal.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  check(
    "signal.ts imports nothing from node:",
    !/from ["']node:/.test(signalCode),
    "this module runs in both browsers"
  );
  check(
    "and is not marked server-only",
    !/["']server-only["']/.test(signalCode),
    "the whole point is that it is not"
  );
  check(
    "while channel.ts, which mints, stays on the server",
    /from ["']node:crypto["']/.test(read("src/lib/calls/channel.ts")),
    "minting a secret in a browser would mean the browser chose it"
  );
}

console.log("\nThe browser half never sends us anything it should not");
{
  /*
    `useCall` holds the one object in this system that knows both parties' IP
    addresses — the peer connection. Its candidates and its SDP are the most
    sensitive thing a call produces, and the temptation to POST the stats object
    wholesale to our own server for "diagnostics" is exactly how a call log
    becomes a map of where every customer lives.

    The server's allowlist would drop it anyway. That is not a reason to send
    it: a body that has to be stripped is a body that was written down in a log
    somewhere on the way.
  */
  const hook = code("src/lib/calls/useCall.ts");

  check(
    "the hook never posts an SDP to our server",
    !/body:\s*JSON\.stringify\([^)]*\b(sdp|localDescription|remoteDescription)\b/i.test(hook),
    "an SDP carries the DTLS fingerprint and the whole candidate list"
  );
  check(
    "nor a candidate",
    !/\/event[\s\S]{0,400}candidate/i.test(hook),
    "a candidate string contains both parties' local and public addresses"
  );
  check(
    "candidates go to the peer over the signalling channel instead",
    /send\("candidate"/.test(hook),
    "which is the only place they belong"
  );
  check(
    "it asks for the microphone before anybody is rung",
    hook.indexOf("getUserMedia") < hook.indexOf('"/api/calls/invite"'),
    "a permission prompt after a rider has pulled over is the worst possible ordering"
  );
  check(
    "it stops every track when the call ends",
    /getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/.test(hook),
    "a live track leaves the recording dot lit after somebody thinks they hung up"
  );
  check(
    "and releases the microphone when the rider is only notified",
    /REQUEST_CALLBACK[\s\S]{0,200}releaseMic\(\)/.test(hook),
    "holding it open while waiting for a call back lights the indicator for minutes"
  );
  check(
    "a closing tab is a hang-up",
    /pagehide/.test(hook),
    "otherwise the row stays open forever"
  );
  check(
    "there is exactly one automatic retry",
    /retriedRef\.current = true/.test(hook) && /!retriedRef\.current/.test(hook),
    "a retry loop on a network that cannot relay is a screen that says connecting until they give up"
  );
  check(
    "and it does not retry when there is no relay to retry through",
    /!retriedRef\.current && invite\.relayCapable/.test(hook),
    "forcing relay-only with no relay configured fails faster and no more usefully"
  );
  check(
    "the ring gives up rather than ringing forever",
    /RING_TIMEOUT_MS/.test(hook),
    "a call that rings forever is a customer who thinks it is connecting"
  );
}

console.log("\nThe call surface says the true thing, and always offers a human");
{
  const sheet = read("src/components/customer/call/CallSheet.tsx");
  const sheetCode = code("src/components/customer/call/CallSheet.tsx");

  check(
    "the dispatch line is not behind a condition",
    /href={`tel:\$\{DISPATCH_TEL\}`}/.test(sheetCode) &&
      !/\{\s*(?:failed|error|call\.endReason)[^}]*&&\s*\(?\s*<a\s+href={`tel:/.test(sheetCode),
    "the logic deciding when to offer a human is the logic most likely to be wrong when one is needed"
  );
  check(
    "it takes a name, never a number",
    /peerName/.test(sheetCode) && !/\+?237\s?\d{6,}/.test(sheetCode.replace(/DISPATCH_\w+/g, "")),
    "the rider's number is the thing this feature exists to avoid disclosing"
  );
  check(
    "every end reason has copy in both languages",
    (() => {
      /*
        Per key rather than by counting. The first version compared a count of
        `fr:` against the number of reasons and failed on an eighth `fr:` that
        was simply somewhere else in the slice — a check that is right about the
        rule and wrong about the file, which is the most annoying kind.
      */
      const block = sheet.slice(
        sheet.indexOf("const ENDED_COPY"),
        sheet.indexOf("export interface CallSheetProps")
      );
      return END_REASONS.every((r) => {
        const at = block.indexOf(`${r}:`);
        if (at < 0) return false;
        // The entry's own body: up to the next reason, or the end of the block.
        const rest = block.slice(at, at + 400);
        return /\ben:/.test(rest) && /\bfr:/.test(rest);
      });
    })(),
    "a single 'call failed' leaves every one of these people stuck in a different way"
  );
  check(
    "there is no 'call again' while a call is still starting",
    /call\.state === "requesting-mic"/.test(sheetCode) && /\{inProgress \? \(/.test(sheetCode),
    "a button inviting a restart before anything has failed is one tap from two calls"
  );
  check(
    "and it says nothing is recorded",
    /(recorded|enregistr)/i.test(sheetCode),
    "a voice feature that does not say this is one people assume the worst of"
  );

  const button = code("src/components/customer/call/CallRiderButton.tsx");
  check(
    "the button renders nothing rather than disabling itself",
    /if \(!callable\) return null/.test(button),
    "a greyed-out phone advertises a feature, invites a tap, and answers with nothing"
  );
  check(
    "and the sheet is only mounted once somebody has chosen to call",
    /\{open && \(/.test(button),
    "mounting it eagerly would prompt for the microphone on a page nobody asked to call from"
  );

  // The callability question must not be answered by the public tracking route.
  const track = code("src/app/api/track/[orderCode]/route.ts");
  check(
    "the public tracking payload does not decide who may call",
    !/callable/.test(track),
    "that route answers any order code; whether *you* may call depends on who is asking"
  );
  check(
    "the screen asks the authorised endpoint instead",
    code("src/components/customer/LiveTrackMap.tsx").includes("/api/calls/can"),
    "a call button rendered off a public payload appears for anybody holding a screenshot"
  );
}

console.log("\nAnd the published policy says what the code does");
{
  /*
    A feature that changes what a product records has to change what the
    product *says* it records, and the two drift apart the moment they live in
    different files with nobody comparing them.

    The privacy page is the promise. These checks are the thin thread tying it
    to the implementation — not a proof that the sentences are true, but a
    guarantee that removing them is a deliberate act rather than an oversight.
  */
  const privacy = read("src/app/privacy/page.tsx");

  check(
    "the policy mentions calling at all",
    /calling your rider|call the rider on your order/i.test(privacy),
    "a feature that records something new and says nothing about it is the definition of a surprise"
  );
  check(
    "it says neither party sees a number",
    /neither of you sees the other(?:&apos;|')s phone number/i.test(privacy),
    "this is the claim the whole feature exists to make good on"
  );
  check(
    "it says calls are not recorded",
    /we do not record calls/i.test(privacy),
    "people assume the worst of a voice feature that stays quiet about this"
  );
  check(
    "it says what *is* kept, rather than only what is not",
    /how long it lasted|whether the connection worked/i.test(privacy),
    "a policy that lists only the reassuring half is the one that gets caught out"
  );
  check(
    "and it names the relay",
    /relayed through a third-party server/i.test(privacy),
    "audio leaving our infrastructure is exactly the thing a policy has to disclose"
  );
}

console.log(
  failures === 0
    ? "\nA call can only be opened by the two people on the order, and leaves nothing behind.\n"
    : `\n${failures} failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
