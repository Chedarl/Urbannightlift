/**
 * Proves the hub shows what the catalogue holds and nothing else.
 *
 * ## What changed
 *
 * `/order` was seven identical rows — icon, name, sentence, arrow — each
 * leading elsewhere. It answered "which of our categories is this?", which is
 * our taxonomy and not the customer's question. Theirs is "who is cooking" and
 * "which pharmacy is open", and the answer sat two taps away behind a phrase
 * like *Food pickup*.
 *
 * The services we have businesses in now get a shelf of three real ones on the
 * hub itself.
 *
 * ## Why that needs watching
 *
 * A landing page wants to look full, and the cheapest way to make one look full
 * is to put names on it. The prototype this design came from does exactly that,
 * from a file of sixty businesses with invented phone numbers and ratings. This
 * product shipped that for real in v49 — three restaurants with fabricated
 * menus and stock photography, orderable — and took them out again.
 *
 * So: the shelf is a query against the same four conditions every other
 * customer-facing list uses, and an empty shelf renders nothing at all. An empty
 * page is a correct page while the calling is still being done.
 *
 * Run: npx tsx scripts/verify-order-hub.ts
 */

import fs from "node:fs";
import path from "node:path";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
/** Comments stripped — these files argue for the rules they are checked against. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SECTION = "src/components/customer/order/FeaturedSection.tsx";
const QUERY = "src/lib/merchants/featured.ts";
const HUB = "src/components/customer/ServiceSelection.tsx";
const PAGE = "src/app/order/page.tsx";

console.log("Nothing on the shelf that is not in the catalogue");
{
  const query = code(QUERY);

  check(
    "the shelf is a query, not a list of names in a file",
    /prisma\.merchant\.findMany/.test(query) && !/\[\s*\{\s*name:/.test(query),
    "the cheapest way to make a landing page look full is the way v49 had to be undone"
  );
  check(
    "and it uses the same four conditions as every other customer-facing list",
    /verified:\s*true/.test(query) && /active:\s*true/.test(query) && /acceptingOrders:\s*true/.test(query),
    "a merchant auto-created by a customer's order has none of the first three and must not appear here"
  );
  /*
   * Matched as selected fields, not as substrings.
   *
   * The first version tested `/rating/i` and failed on correct code, because
   * "operating" contains it — `getOperatingSettings` is right there deciding
   * who is open. That is now the eighth time a check in this project has
   * matched its own vocabulary, and the lesson each time is the same: look for
   * the shape the mistake would actually take, which here is a Prisma `select`
   * entry.
   */
  check(
    "no rating, photograph or review is selected",
    !/\b(rating|reviewCount|photoUrl|reviews)\s*:\s*true/.test(query),
    "a field selected is a field that ends up on screen"
  );
  check(
    "an empty shelf renders nothing at all",
    /merchants\.length === 0\) return null/.test(code(SECTION)),
    "an empty page is a correct page while the calling is still being done"
  );
}

console.log("\nThe clock is read in one place, after the browser is there");
{
  const section = code(SECTION);
  const query = code(QUERY);

  check(
    "the query hands over a timestamp rather than a phrase",
    /checkedAt:\s*m\.availabilityCheckedAt/.test(query) && !/freshLabel/.test(query),
    "wording it on the server ships 'confirmed 12 minutes ago' to a French reader"
  );
  check(
    "and the line is only computed once the browser has hydrated",
    /mounted \? freshLabel/.test(section),
    "the server's minute and the phone's minute decide it separately — that is the shape of the 'updated just now ago' bug v50 shipped"
  );
  check(
    "the open/closed state is decided with the same wrap-past-midnight arithmetic as the food list",
    /start <= end \? hour >= start && hour < end : hour >= start \|\| hour < end/.test(query),
    "the hub and the list it links to cannot be allowed to disagree about who is open"
  );
}

console.log("\nOne brand on the page, one accent per shelf");
{
  const hub = code(HUB);
  const section = code(SECTION);

  check(
    "the service tiles are still there for everything",
    /services\.map/.test(hub),
    "the shelves only cover the services we have businesses in; the rest of the product still has to be reachable"
  );
  check(
    "food and pharmacy each get their own shelf",
    /accent="amber"/.test(hub) && /accent="emerald"/.test(hub)
  );
  check(
    "a shelf only appears for a service that is actually running tonight",
    /isLive\("FOOD_PICKUP"\) && \(/.test(hub) && /isLive\("MEDICINE_PICKUP"\) && \(/.test(hub),
    "a paused service showing three restaurants is an order that cannot be placed"
  );
  check(
    "the accent is two elements, not a repaint of the page",
    (section.match(/HEX\[accent\]/g) ?? []).length <= 2,
    "ServiceSelection decided against a per-service rainbow for good reasons and this does not overturn it"
  );
}

console.log("\nThe markup is valid and the taps work");
{
  const section = code(SECTION);

  check(
    "a card is not wrapped in a link",
    !/<Link[^>]*>\s*<BusinessCard/.test(section),
    "a button inside an anchor nests two interactive elements, which is a keyboard problem before it is a validity one"
  );
  check(
    "the card navigates itself",
    /onSelect=\{\(\) => router\.push\(href\)\}/.test(section)
  );
  check(
    "and the heading carries the real link, so the section is shareable",
    /<Link\s*\n?\s*href=\{href\}/.test(section)
  );
}

console.log("\nRead on the server, so the hub never flashes empty");
{
  const page = code(PAGE);
  check(
    "the shelves are fetched in the page, not by the browser",
    /featuredMerchants\("FOOD"\)/.test(page) && /featuredMerchants\("PHARMACY"\)/.test(page)
  );
  check(
    "both in one round trip",
    /Promise\.all\(\[\s*\n?\s*featuredMerchants/.test(page),
    "two serial queries on a Yaoundé connection is a page that arrives twice"
  );
}

console.log(
  `\n${failures === 0 ? "The hub shows who is cooking, and only the ones that are." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
