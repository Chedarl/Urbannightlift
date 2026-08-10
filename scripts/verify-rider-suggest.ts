/**
 * Proves the rider ranking, before it is allowed to influence who rides.
 *
 * This decides which name a dispatcher sees first at 1 AM, and the two ways it
 * can be quietly wrong are both expensive:
 *
 *  1. **It sends somebody to the wrong side of the city** — by ranking on a
 *     position that is forty minutes old, which is a place a rider used to be.
 *  2. **It always picks the same person** — which is not a bug you notice in a
 *     screenshot, it is a rota that makes one rider do every job and the rest
 *     stop opening the app.
 *
 * So the properties below are the things a dispatcher would have checked in
 * their head, written down.
 *
 * Run: npx tsx scripts/verify-rider-suggest.ts
 */
import {
  suggestRiders,
  usableKm,
  topLine,
  FIX_USEFUL_MS,
  type RiderCandidate,
} from "../src/lib/riders/suggest";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const NOW = new Date("2026-08-11T01:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

/** Bastos, and a point about 8 km south. */
const PICKUP = { lat: 3.894, lng: 11.517 };
const NEAR = { lat: 3.8955, lng: 11.5182 };
const FAR = { lat: 3.82, lng: 11.53 };

function rider(over: Partial<RiderCandidate> & { id: string; fullName: string }): RiderCandidate {
  return {
    isOnline: true,
    lat: null,
    lng: null,
    fixAt: null,
    activeOrders: 0,
    ...over,
  };
}

const rank = (candidates: RiderCandidate[]) =>
  suggestRiders({ pickup: PICKUP, candidates, now: NOW }).map((s) => s.rider.id);

console.log("\nOn duty beats everything");
check(
  "an on-duty rider across town outranks an off-duty one next door",
  rank([
    rider({ id: "off-near", fullName: "Near", isOnline: false, ...NEAR, fixAt: ago(1) }),
    rider({ id: "on-far", fullName: "Far", isOnline: true, ...FAR, fixAt: ago(1) }),
  ])[0] === "on-far",
  "a rider two streets away who has gone home is not closer than one who is working"
);
check(
  "but an off-duty rider is still listed",
  rank([rider({ id: "off", fullName: "Off", isOnline: false })]).length === 1,
  "at 2 AM there may be nobody online, and a screen that says 'no riders' when three could be phoned is worse than useless"
);

console.log("\nA free rider beats a busy one");
check(
  "nobody carrying two gets the job while somebody is free",
  rank([
    rider({ id: "busy", fullName: "Busy", activeOrders: 2, ...NEAR, fixAt: ago(1) }),
    rider({ id: "free", fullName: "Free", activeOrders: 0, ...FAR, fixAt: ago(1) }),
  ])[0] === "free",
  "however close the busy one happens to be"
);
check(
  "and one job beats two",
  rank([
    rider({ id: "two", fullName: "Two", activeOrders: 2 }),
    rider({ id: "one", fullName: "One", activeOrders: 1 }),
  ])[0] === "one"
);

console.log("\nCloser wins, all else equal");
check(
  "the nearer of two identical riders is first",
  rank([
    rider({ id: "far", fullName: "Far", ...FAR, fixAt: ago(1) }),
    rider({ id: "near", fullName: "Near", ...NEAR, fixAt: ago(1) }),
  ])[0] === "near"
);

console.log("\nAn old position is not a location");
{
  const stale = rider({ id: "stale", fullName: "Stale", ...NEAR, fixAt: ago(40) });
  check(
    "a 40-minute-old fix is refused",
    usableKm(stale, PICKUP, NOW) === null,
    "ranking on it would send somebody confidently to where the rider used to be"
  );
  check(
    "a fresh fix is used",
    (usableKm(rider({ id: "f", fullName: "F", ...NEAR, fixAt: ago(2) }), PICKUP, NOW) ?? 99) < 1
  );
  check(
    "the boundary is the constant, not a number typed twice",
    usableKm({ ...NEAR, fixAt: new Date(NOW.getTime() - FIX_USEFUL_MS + 1000) }, PICKUP, NOW) != null &&
      usableKm({ ...NEAR, fixAt: new Date(NOW.getTime() - FIX_USEFUL_MS - 1000) }, PICKUP, NOW) == null
  );
  check(
    "and a stale-fix rider still ranks, just without a distance claim",
    rank([stale]).length === 1 &&
      suggestRiders({ pickup: PICKUP, candidates: [stale], now: NOW })[0].km === null
  );
}

console.log("\nNo pin on the order, no distance invented");
{
  const s = suggestRiders({
    pickup: null,
    candidates: [rider({ id: "a", fullName: "A", ...NEAR, fixAt: ago(1) })],
    now: NOW,
  });
  check("distance is null rather than guessed", s[0].km === null);
  check("and it still produces a usable ranking", s.length === 1 && s[0].score > 0);
}

console.log("\nA rider who cannot take it is not offered");
{
  const s = suggestRiders({
    pickup: PICKUP,
    candidates: [
      rider({ id: "blocked", fullName: "Blocked", blockedReason: "No float for a shopping order" }),
      rider({ id: "ok", fullName: "Ok" }),
    ],
    now: NOW,
  });
  check("blocked riders are dropped entirely", s.length === 1 && s[0].rider.id === "ok", "a name a dispatcher cannot press wastes a glance");
}

console.log("\nThe order is stable and explains itself");
{
  const twins = [
    rider({ id: "b", fullName: "Bea" }),
    rider({ id: "a", fullName: "Ama" }),
  ];
  check(
    "two identical riders always come back in the same order",
    JSON.stringify(rank(twins)) === JSON.stringify(rank([...twins].reverse())),
    "a list that reshuffles while somebody is reading it is a list they stop trusting"
  );
  const s = suggestRiders({
    pickup: PICKUP,
    candidates: [rider({ id: "a", fullName: "A", ...NEAR, fixAt: ago(1) })],
    now: NOW,
  });
  check("every suggestion carries reasons", s[0].reasons.length >= 2);
  check("in both languages", s[0].reasonsFr.length === s[0].reasons.length);
  check("and a one-line summary a person would say out loud", topLine(s[0], false).includes("·"));
  check("which is different in French", topLine(s[0], true) !== topLine(s[0], false));
}

console.log("\nNobody is ranked on nothing");
check(
  "an empty list produces an empty list, not a crash",
  suggestRiders({ pickup: PICKUP, candidates: [], now: NOW }).length === 0
);

console.log(
  `\n${failures === 0 ? "The right rider is first, for a reason a dispatcher can read." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
