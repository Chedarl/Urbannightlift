/**
 * Proves a business is only shown open when its own board says so.
 *
 * ## The bug this suite exists because of
 *
 * The owner supplied the first real catalogue — nineteen pharmacies and about
 * sixty food businesses, each carrying its trading hours. The pipeline threw
 * the hours away: `intakeMerchant` read `nightOpen: input.nightOpen ?? true`
 * and the paste importer never passed the field. Every row it has ever created
 * was recorded as open every night.
 *
 * Against that data the consequence is specific and countable. Roughly
 * forty-eight of the sixty close between 21:00 and midnight. At 1 a.m. all of
 * them would have carried an "open" badge, and a rider would have been sent to
 * a locked door — the v12 failure again, except the false claim would be ours,
 * made against data that contained the right answer.
 *
 * ## The four properties
 *
 * 1. **Unreadable hours never mean open.** The direction the mistake falls in
 *    is the whole safety margin.
 * 2. **A 21:00 close is not a night business**, and a 24-hour one is.
 * 3. **The close hour beats the bit.** "Closes 12:00 AM" is open at 22:00 and
 *    shut at 01:00, which one boolean cannot say.
 * 4. **Nothing can set `nightOpen` without evidence** — not the importer, not
 *    `intakeMerchant`.
 *
 * Run: npx tsx scripts/verify-opening-hours.ts
 */

import fs from "node:fs";
import path from "node:path";

import { readHours, openAtHour, ASSUMED_OPENS_AT } from "../src/lib/merchants/openingHours";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const START = 18;
const END = 4;
const openAt1am = (h: ReturnType<typeof readHours>) => openAtHour(h, 1, START, END);
const openAt10pm = (h: ReturnType<typeof readHours>) => openAtHour(h, 22, START, END);

console.log("It reads the hours the owner's batches actually carry");
{
  const cases: [string, boolean, boolean][] = [
    // text,                              open at 22:00, open at 01:00
    ["Open 24 hours", true, true],
    ["Open · Closes 9:00 PM", false, false],
    ["Open · Closes 10:00 PM", false, false],
    ["Open · Closes 11:00 PM", true, false],
    ["Open · Closes 11:30 PM", true, false],
    ["Open · Closes 11:59 PM", true, false],
    ["Open · Closes 12:00 AM Fri", true, false],
    ["Open · Closes 12:00 AM Sun", true, false],
    ["open until 6 AM", true, true],
    // An opening time with no close says nothing about the evening, so both
    // screens fall to shut — rule 1, and the reason it is rule 1.
    ["Closed · Opens 12:00 PM", false, false],
    ["Closed · Opens 11:00 AM", false, false],
    ["Open · Closes 5:00 PM", false, false],
    ["24/7", true, true],
  ];
  for (const [text, at22, at1] of cases) {
    const h = readHours(text);
    check(`"${text}" @22:00 → ${at22 ? "open" : "shut"}`, openAt10pm(h) === at22, JSON.stringify(h));
    check(`"${text}" @01:00 → ${at1 ? "open" : "shut"}`, openAt1am(h) === at1, JSON.stringify(h));
  }
}

console.log("");
console.log("Unreadable hours never mean open");
{
  for (const blank of ["", "   ", "Open", "Temporarily closed", "Hours unknown", "🍽️ Restaurant"]) {
    const h = readHours(blank);
    check(`"${blank}" is not known`, h.known === false, JSON.stringify(h));
    check(`"${blank}" is not night-open`, h.nightOpen === false && h.open24h === false);
    check(`"${blank}" is shut at 01:00`, openAt1am(h) === false);
  }
  check(
    "a bare 'Open' says nothing about 2 a.m.",
    readHours("Open").known === false
  );
}

console.log("");
console.log("The close hour beats the bit");
{
  const midnight = readHours("Open · Closes 12:00 AM");
  check("midnight close is recorded as hour 0", midnight.closesAtHour === 0, String(midnight.closesAtHour));
  check("and counts as a night business", midnight.nightOpen === true);
  check("open at 22:00", openAt10pm(midnight) === true);
  check("shut at 01:00 — which one boolean could not say", openAt1am(midnight) === false);

  const late = readHours("open until 6 AM");
  check("a 6 a.m. close is open at 01:00", openAt1am(late) === true);
  check("and at 03:00", openAtHour(late, 3, START, END) === true);
  check("and shut at 07:00", openAtHour(late, 7, START, END) === false);

  const nine = readHours("Open · Closes 9:00 PM");
  check("a 21:00 close is not a night business", nine.nightOpen === false);
  check("but is open at 19:00", openAtHour(nine, 19, START, END) === true);

  // No close hour at all: the old behaviour, driven by the coarse flag and the
  // trading window. Rows imported before this module are all in this state.
  const legacy = { nightOpen: true, open24h: false, closesAtHour: null, opensAtHour: null };
  check("with no close hour it falls back to the night flag", openAtHour(legacy, 1, START, END) === true);
  check("and respects the trading window", openAtHour(legacy, 12, START, END) === false);
  const legacyClosed = { ...legacy, nightOpen: false };
  check("a legacy row that is not night-open stays shut", openAtHour(legacyClosed, 1, START, END) === false);

  check("an opening time is assumed at 06:00 when unstated", ASSUMED_OPENS_AT === 6);
}

console.log("");
console.log("24 hours beats a contradictory line");
{
  const both = readHours("Open 24 hours · Closes 11:00 PM");
  check("a listing that contradicts itself resolves to 24 hours", both.open24h === true, JSON.stringify(both));
  check("and is open at 04:00", openAtHour(both, 4, START, END) === true);
}

console.log("");
console.log("Nothing can claim night-open without evidence");
{
  const intake = read("src/lib/merchants/intake.ts");
  check(
    "intakeMerchant no longer defaults nightOpen to true",
    !/nightOpen:\s*input\.nightOpen \?\? true/.test(intake),
    (intake.match(/nightOpen:.*$/m) ?? [])[0]
  );
  check(
    "it derives the flags from the hours text instead",
    /nightOpen: input\.nightOpen \?\? hours\.nightOpen/.test(intake) &&
      /open24h: input\.open24h \?\? hours\.open24h/.test(intake)
  );
  check(
    "and reads them exactly once, so create and update cannot drift",
    (intake.match(/readHours\(/g) ?? []).length === 1
  );

  const imp = read("src/app/api/merchants/import/route.ts");
  check(
    "the importer passes the night flags through",
    /nightOpen: truthy\(record\.nightOpen\)/.test(imp) && /open24h: truthy\(record\.open24h\)/.test(imp)
  );
  check(
    "an absent column is undefined, not false, so the hours text still wins",
    /if \(v == null \|\| v\.trim\(\) === ""\) return undefined;/.test(imp)
  );

  for (const [label, route] of [
    ["food", "src/app/api/food/browse/route.ts"],
    ["pharmacy", "src/app/api/pharmacy/browse/route.ts"],
  ] as const) {
    const raw = read(route);
    // Comments stripped: both routes *describe* the arithmetic they replaced,
    // and the first version of this check matched its own explanation.
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    check(`${label} browse asks openAtHour`, /openAtHour\(/.test(src));
    check(
      `${label} browse selects the close hour`,
      /closesAtHour: true/.test(src) && /opensAtHour: true/.test(src)
    );
    check(
      `${label} browse no longer keeps its own window arithmetic`,
      !/isNight && m\.nightOpen|open24h \|\| \(isNight/.test(src),
      (src.match(/.*isNight.*/) ?? [])[0]
    );
  }
}

console.log("");
console.log("The owner's own batch, priced at 1 a.m.");
{
  // The exact strings from the pasted catalogue, so the count in the plan is
  // checked rather than asserted.
  const batch: [string, string][] = [
    ["Roundabout Express", "Open · Closes 12:00 AM Sun"],
    ["Chillax LOUNGE VIP", "Open 24 hours"],
    ["Collin's Center", "Open 24 hours"],
    ["Complexe le sims", "Open 24 hours"],
    ["Boulangerie LOWE MENDONG", "Open 24 hours"],
    ["Chez UNKU BOBO", "Open 24 hours"],
    ["Rustick Home", "Open 24 hours"],
    ["Téfri fast-food", "Open 24 hours"],
    ["Le Click Plus", "Open 24 hours"],
    ["Village happi", "Open · Closes 11:30 PM"],
    ["THE CANTEEN'S", "open until 6 AM"],
    ["Mr Sam Fast-food Mendong", "Open · Closes 9:00 PM"],
    ["Yum Yum Restaurant and Grill", "Open · Closes 10:00 PM"],
    ["COMPLEXE BM", "Open · Closes 12:00 AM Fri"],
    ["La Terrasse", "Open · Closes 11:00 PM"],
    ["Àllo Pizza Mendong", "Closed · Opens 11:30 AM"],
  ];
  const open = batch.filter(([, h]) => openAt1am(readHours(h)));
  console.log(`       open at 01:00: ${open.map(([n]) => n).join(", ")}`);
  check(
    "only the genuinely round-the-clock places read as open at 1 a.m.",
    open.length === 9,
    `${open.length} of ${batch.length}`
  );
  check(
    "the ones closing at midnight are open at 22:00",
    openAt10pm(readHours("Open · Closes 12:00 AM Fri")) === true
  );
  check(
    "and a 21:00 close appears on neither screen",
    !openAt10pm(readHours("Open · Closes 9:00 PM")) && !openAt1am(readHours("Open · Closes 9:00 PM"))
  );
}

console.log("");
console.log(failures === 0 ? "All good." : `${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
