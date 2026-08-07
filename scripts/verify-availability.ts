/**
 * Proves that "what have you got tonight?" cannot invent a menu.
 *
 * This is the feature nobody else in this market has: everywhere else you order
 * a dish, wait forty minutes, and find out it ran out when the rider arrives.
 * The restaurant always knew. Asking them is the whole idea.
 *
 * Which puts a model between a sentence typed one-handed next to a fire and
 * what a customer is allowed to order. Three rules make that safe, and all
 * three are checked here:
 *
 *  1. **A name we cannot match is never created.** The model returns words;
 *     those words are matched against *this merchant's own* items, and anything
 *     that does not match is reported for a human. A restaurant saying "we have
 *     ndolé" when ndolé is not on their list is a menu question, not a stock
 *     question — answering it automatically would put a dish in front of a
 *     customer at a price nobody set.
 *  2. **A confused reply fails towards sold out.** A customer who cannot order
 *     something we have is mildly disappointed. One who orders something we do
 *     not have has been let down at 1 AM by a business that promised it.
 *  3. **Silence is not availability.** A restaurant nobody asked tonight says
 *     so, rather than being shown as if everything is on.
 *
 * Run: npx tsx scripts/verify-availability.ts
 */
import { shapeReading, matchItems, type CatalogueItem } from "../src/lib/ai/availability";
import { freshLabel, FRESH_MINUTES } from "../src/lib/merchants/freshness";
import { createPingToken, readPingToken } from "../src/lib/merchants/pingLink";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

/** A real small Yaoundé menu. */
const MENU: CatalogueItem[] = [
  { id: "i1", name: "Poisson braisé", nameFr: "Poisson braisé" },
  { id: "i2", name: "Poulet DG", nameFr: "Poulet DG" },
  { id: "i3", name: "Attiéké", nameFr: "Attiéké" },
  { id: "i4", name: "Brochettes de bœuf", nameFr: "Brochettes de bœuf" },
];

console.log("\nWhat they said, matched to what they sell");
check(
  "a dish named exactly is matched",
  matchItems(["Poisson braisé"], MENU).matched[0]?.item.id === "i1"
);
check(
  "accents and case do not matter — nobody types them at 11 PM",
  matchItems(["poisson braise"], MENU).matched[0]?.item.id === "i1"
);
check("a partial name still finds it", matchItems(["poulet dg"], MENU).matched[0]?.item.id === "i2");
check(
  "the same dish twice is one change",
  matchItems(["poisson braisé", "le poisson"], MENU).matched.length === 1
);

console.log("\nAnd what they said that we do not sell is never invented");
const unknown = matchItems(["ndolé", "koki"], MENU);
check("neither is matched", unknown.matched.length === 0);
check("both are reported instead", unknown.unmatched.length === 2, unknown.unmatched.join(", "));
check(
  "a dish nobody carries never becomes a product",
  !unknown.matched.some((m) => m.item.name.toLowerCase().includes("ndol")),
  "a price nobody set, in front of a customer, is how this goes wrong"
);

console.log("\nA reply becomes only the changes it actually names");
const out = shapeReading({ soldOut: ["poisson braisé"] }, MENU);
check("one dish off", out.changes.length === 1 && out.changes[0].soldOut);
check("and it is the right one", out.changes[0].itemId === "i1");
check(
  "the other three are untouched",
  !out.changes.some((c) => c.itemId !== "i1"),
  "a dish nobody mentioned is not a dish that ran out"
);

const back = shapeReading({ available: ["attiéké"] }, MENU);
check("a dish named as available comes back on", back.changes[0]?.itemId === "i3" && !back.changes[0].soldOut);

console.log("\n“On a tout” turns everything back on, because nobody types twenty lines");
const all = shapeReading({ allAvailable: true }, MENU);
check("every item is a change", all.changes.length === MENU.length);
check("and every one of them is available", all.changes.every((c) => !c.soldOut));
const allBut = shapeReading({ allAvailable: true, soldOut: ["brochettes"] }, MENU);
check(
  "“tout sauf les brochettes” still takes the brochettes off",
  allBut.changes.find((c) => c.itemId === "i4")?.soldOut === true,
  "the exception has to survive the sweeping statement"
);
check(
  "and leaves the rest on",
  allBut.changes.filter((c) => !c.soldOut).length === MENU.length - 1
);

console.log("\nA confused reply fails towards sold out");
const both = shapeReading({ soldOut: ["poulet dg"], available: ["poulet dg"] }, MENU);
check(
  "named both ways, it is off",
  both.changes.length === 1 && both.changes[0].soldOut,
  "disappointing a customer is recoverable; promising food that does not exist at 1 AM is not"
);

console.log("\nNothing said is nothing changed");
check("an empty answer changes nothing", shapeReading({}, MENU).changes.length === 0);
check(
  "a reply about something else is carried as a note, not a change",
  (() => {
    const r = shapeReading({ note: "We close at 1am tonight" }, MENU);
    return r.changes.length === 0 && r.note === "We close at 1am tonight";
  })()
);

console.log("\nSilence is never shown as availability");
check("never asked reads as never asked", !freshLabel(null).fresh);
check(
  "and says so on the customer's screen",
  freshLabel(null).text === "not confirmed tonight" && freshLabel(null, true).text.includes("pas confirmé")
);
check(
  "an answer from an hour ago is fresh",
  freshLabel(new Date(Date.now() - 60 * 60_000)).fresh
);
check(
  "an answer from last night is not",
  !freshLabel(new Date(Date.now() - (FRESH_MINUTES + 30) * 60_000)).fresh,
  "yesterday's stock is not tonight's, and pretending otherwise is the lie this feature exists to stop"
);
check("just now says just now", freshLabel(new Date()).text.includes("just now"));

console.log("\nThe link a restaurant taps");
const token = createPingToken("merch-1", "ping-1");
check("a good token reads back", readPingToken(token)?.m === "merch-1");
check("and carries the ping it answers", readPingToken(token)?.p === "ping-1");
check("one changed character is refused", readPingToken(token.slice(0, -2) + "xy") === null);
check("a token with no signature is refused", readPingToken("abc") === null);
check(
  "an expired link is dead",
  readPingToken(createPingToken("merch-1", "ping-1", -1000)) === null,
  "availability is a fact about tonight, so the link is too"
);
check(
  "the expiry cannot be pushed out by editing the URL",
  (() => {
    // The claim is inside the signature, so a re-encoded payload no longer verifies.
    const payload = token.slice(0, token.lastIndexOf("."));
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    claim.exp = Date.now() + 999_999_999;
    const forged = Buffer.from(JSON.stringify(claim)).toString("base64url");
    return readPingToken(`${forged}.${token.slice(token.lastIndexOf(".") + 1)}`) === null;
  })()
);


console.log("\nThe first reply builds the menu");
{
  // A business we have just verified, with nothing listed. This is the case the
  // whole feature used to refuse — and refusing it is what left new merchants
  // permanently empty, because asking is the only way to get a list.
  const fresh = shapeReading(
    { priced: [{ name: "gâteau chocolat", priceXaf: 5000 }, { name: "croissant", priceXaf: 500 }] },
    []
  );
  check("both dishes come back to be added", fresh.newItems.length === 2);
  check("with the price they actually said", fresh.newItems[0].priceXaf === 5000);
  check(
    "and nothing is marked sold out",
    fresh.changes.length === 0,
    "there is no menu yet, so there is nothing that could have run out"
  );
}

console.log("\nA price is repeated, never invented");
check(
  "no price given is no price shown",
  shapeReading({ priced: [{ name: "beignets" }] }, []).newItems[0].priceXaf === null,
  "a blank price asks a person; a guessed one becomes an argument at the door"
);
check(
  "a misread decimal is refused rather than published",
  shapeReading({ priced: [{ name: "gâteau", priceXaf: 5 }] }, []).newItems[0].priceXaf === null,
  "5 XAF for a cake is a model that read 5.000 as five, and it must not reach a menu"
);
check(
  "a negative price is refused",
  shapeReading({ priced: [{ name: "gâteau", priceXaf: -900 }] }, []).newItems[0].priceXaf === null
);
check(
  "an absurd price is refused",
  shapeReading({ priced: [{ name: "gâteau", priceXaf: 99_000_000 }] }, []).newItems[0].priceXaf === null
);
check(
  "a fractional price is rounded, not dropped",
  shapeReading({ priced: [{ name: "gâteau", priceXaf: 4999.6 }] }, []).newItems[0].priceXaf === 5000
);

console.log("\nAnd it is still never created behind anybody's back");
{
  const known = shapeReading({ priced: [{ name: "poisson braisé", priceXaf: 4000 }] }, MENU);
  check(
    "something already on their list is not offered as new",
    known.newItems.length === 0,
    "that is a price change, which is a person's decision, not a stock reading"
  );
}
{
  const named = shapeReading({ available: ["ndolé"] }, MENU);
  check("a dish we do not carry is offered rather than created", named.newItems.length === 1);
  check("and it carries no price nobody gave", named.newItems[0].priceXaf === null);
  check(
    "it is still reported as unmatched too",
    named.unmatched.includes("ndolé"),
    "the old wording stays for anyone reading the reading, not just the panel"
  );
}
check(
  "the same dish named twice is offered once",
  shapeReading(
    { priced: [{ name: "ndolé", priceXaf: 3000 }], available: ["Ndole"] },
    MENU
  ).newItems.length === 1
);
check(
  "a priced reading wins over a bare mention",
  shapeReading(
    { priced: [{ name: "ndolé", priceXaf: 3000 }], available: ["ndolé"] },
    MENU
  ).newItems[0].priceXaf === 3000,
  "a price is the useful half; losing it to a duplicate would waste the reply"
);
check("junk is not a dish", shapeReading({ priced: [{ name: "a" }, {}] }, []).newItems.length === 0);
check(
  "one reply cannot propose a hundred rows",
  shapeReading(
    { priced: Array.from({ length: 40 }, (_, i) => ({ name: `dish ${i}`, priceXaf: 1000 })) },
    []
  ).newItems.length === 20,
  "somebody has to read this list at 1 AM"
);

console.log(
  `\n${failures === 0 ? "It reads what they said, and never more than that." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
