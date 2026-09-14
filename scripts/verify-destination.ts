/**
 * Proves the tracking map knows where the order is going, or says it doesn't.
 *
 * ## The complaint this came from
 *
 * A rider reported that live tracking "is not functioning". There has never
 * been a real order in production to track, so that could not be reproduced as
 * described — but looking for it turned up a real way the screen degrades, and
 * it degrades **silently**, which is the shape of every fault in this project.
 *
 * Yaoundé largely does not use street addresses. People give a quartier and a
 * landmark, so the exact delivery pin is often missing — either never dropped
 * or never geocoded. And a missing pin meant:
 *
 *   - no destination marker
 *   - no route line
 *   - **no arrival time at all** — the ETA is computed rider-to-destination and
 *     was suppressed outright
 *
 * with nothing on screen saying why. A customer sees a dot moving with no
 * context and no ETA; a rider hears "your tracking doesn't work" and is right.
 *
 * The zone centre is about a kilometre loose. Useless for the last hundred
 * metres, perfectly good for *how far away is he*, which is the only question
 * this screen exists to answer. So it is used — and labelled, because an
 * estimate drawn as a pin is how somebody ends up at the wrong gate.
 *
 * Run: npx tsx scripts/verify-destination.ts
 */

import fs from "node:fs";
import path from "node:path";
import { resolveDestination } from "../src/lib/orders/destination";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
const MVAN = { centroidLat: 3.8167, centroidLng: 11.5333, zoneName: "Mvan" };

console.log("The customer's own pin always wins");
{
  const d = resolveDestination({ deliveryLat: 3.8901, deliveryLng: 11.5065, deliveryZone: MVAN });
  check("it is used", d?.lat === 3.8901 && d?.lng === 11.5065);
  check("and not marked approximate", d?.approximate === false);
  check("with no zone attributed to it", d?.from === null);
}

console.log("\nWithout a pin, the zone centre answers instead of nothing");
{
  const d = resolveDestination({ deliveryLat: null, deliveryLng: null, deliveryZone: MVAN });
  check("there is a destination at all", d !== null, "null here is what removed the ETA");
  check("it is the zone centre", d?.lat === 3.8167 && d?.lng === 11.5333);
  check("it is marked approximate", d?.approximate === true, "a guess drawn as a pin sends somebody to the wrong gate");
  check("and it names the zone it came from", d?.from === "Mvan", "the sentence under the map needs to say where this came from");
}

console.log("\nWith neither, it says so rather than inventing a point");
{
  for (const [label, input] of [
    ["no pin and no zone", { deliveryLat: null, deliveryLng: null, deliveryZone: null }],
    ["a zone with no centre", { deliveryZone: { zoneName: "Nowhere" } }],
    ["an empty order", {}],
  ] as const) {
    check(`${label} gives null`, resolveDestination(input) === null);
  }
}

console.log("\nA broken coordinate is not a destination");
{
  const bad: [string, number, number][] = [
    ["0,0 — the Gulf of Guinea, i.e. an unset pair", 0, 0],
    ["latitude past the pole", 91, 11.5],
    ["longitude past the meridian", 3.8, 181],
    ["NaN", Number.NaN, 11.5],
    ["Infinity", 3.8, Number.POSITIVE_INFINITY],
  ];
  for (const [label, lat, lng] of bad) {
    const d = resolveDestination({ deliveryLat: lat, deliveryLng: lng, deliveryZone: MVAN });
    check(
      `${label} falls through to the zone`,
      d?.approximate === true,
      `got ${JSON.stringify(d)} — a bad pin must not be drawn as a real one`
    );
  }

  // And a broken zone centre must not be used either.
  const d = resolveDestination({ deliveryZone: { centroidLat: 0, centroidLng: 0, zoneName: "Broken" } });
  check("a zone centred on 0,0 is refused too", d === null);
}

console.log("\nThe screen draws a guess as a guess");
{
  const map = fs
    .readFileSync(path.join(ROOT, "src/components/customer/LiveTrackMap.tsx"), "utf8")
    // Comments here discuss the bug; a check that greps them finds its own
    // explanation and passes on prose. Same lesson as verify-wiring.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  check(
    "it branches on `approximate`",
    /delivery\.approximate/.test(map),
    "without this the estimate is drawn identically to a real pin"
  );
  check(
    "an approximation is a circle, not a pin",
    /Circle/.test(map),
    "a marker says 'here'; a circle says 'somewhere in here', which is the truth"
  );
  check(
    "and the customer is told in words",
    /approximate &&/.test(map),
    "the caption is what stops an estimate reading as exact"
  );
  check(
    "no destination at all is stated rather than shown as an empty map",
    /rider && !delivery/.test(map),
    "silence is what made this feel broken in the first place"
  );
}

console.log(
  `\n${failures === 0 ? "The map either knows where it is going or says it does not." : `${failures} check(s) FAILED — tracking can degrade without saying so.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
