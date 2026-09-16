/**
 * Proves a price photographed off a chalkboard stays an estimate.
 *
 * ## What changed
 *
 * `readMenuPhoto` has read menu boards into rows since v34, wired to exactly
 * one screen: the admin importer, which *publishes* — its rows become catalogue
 * prices that strangers are quoted, which is why that route is
 * `ADMIN_ROLES`-gated and must stay so. This puts the same reader on the
 * customer's free-text food path, where nothing is published.
 *
 * ## The failure this guards against
 *
 * v49 conflated the **goods estimate** (what the food is expected to cost, what
 * the spending cap is for) with the **delivery fee** (ours, quoted, firm). They
 * are different numbers with different owners and it took two versions to
 * unpick. A number read off a chalkboard by a model is the least firm number in
 * the product, so the one place it may land is the goods estimate, and it has
 * to say on screen that it is not the fee.
 *
 * The second failure is the usual one: a reading that fails must leave the
 * textarea alone rather than invent a dish.
 *
 * Run: npx tsx scripts/verify-board-photo.ts
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
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ROUTE = "src/app/api/ai/menu/route.ts";
const ADMIN_ROUTE = "src/app/api/merchants/[merchantId]/menu-photo/route.ts";
const PANEL = "src/components/customer/food/BoardPhoto.tsx";
const FORM = "src/components/customer/order/forms/FoodForm.tsx";

console.log("The customer route reads and publishes nothing");
{
  const src = code(ROUTE);

  check("it is rate limited on the upload class", /checkRateLimit\(req, "upload"\)/.test(src));
  check("and answers 429 when that is spent", /status: 429/.test(src));
  check(
    "a failed read returns an empty list with the reason",
    /items: \[\], note: error/.test(src)
  );
  check("it writes nothing", !/prisma\.|createMany|\.create\(|\.update\(/.test(src));
  check("it saves to no merchant", !/merchantId/.test(src));
  check("it names no dish", !/Poulet|Brochette|Beignet|Ndolé|Eru/i.test(src));
}

console.log("");
console.log("The publishing route stays admin-only");
{
  const src = code(ADMIN_ROUTE);
  check(
    "the importer that writes catalogue prices still requires an admin",
    /ADMIN_ROLES\.includes\(user\.role\)/.test(src)
  );
  check("and it is still the one that writes", /createMany/.test(src));
}

console.log("");
console.log("A board price is an estimate and says so");
{
  const panel = read(PANEL);
  const src = code(PANEL);

  check(
    "the screen calls the prices an estimate",
    /Prices are an estimate/.test(panel) && /une estimation/.test(panel)
  );
  check(
    "and says in both languages that it is not the delivery fee",
    /this is not the delivery fee/.test(panel) && /ce n'est pas les frais de livraison/.test(panel)
  );
  check(
    "a dish whose price was not read is shown as not read, not as zero",
    /Price not read/.test(panel) && /priceXaf != null/.test(src)
  );
  check(
    "nothing here quotes or computes a delivery fee",
    !/\bfeeXaf\b|quoteDeliveryFee|useLiveFare|priceFirm/.test(src)
  );
  check(
    "a failed reading shows nothing rather than a plausible dish",
    /catch \{[\s\S]{0,400}?setRows\(null\)/.test(src)
  );
  check("it names no dish of its own", !/Poulet|Brochette|Beignet|Ndolé/i.test(src));
  check(
    "nothing is added until dishes are actually ticked",
    /disabled=\{chosen\.length === 0\}/.test(src)
  );
}

console.log("");
console.log("It lands in the goods estimate and nowhere else");
{
  const src = code(FORM);

  check("the board is offered on the free-text path", /<BoardPhoto/.test(src));
  check(
    "its text joins what they typed rather than replacing it",
    /setFreeItems\(\(v\) => \(v\.trim\(\) \? `\$\{v\.trim\(\)\}, \$\{text\}` : text\)\)/.test(src)
  );
  check(
    "its prices fill the goods estimate",
    /goodsCapXaf: goodsEstimateXaf > 0 \? goodsEstimateXaf : freeEstimateXaf/.test(src)
  );
  check(
    "and never the delivery fee, which the server still decides",
    /estimatedFeeXaf: null/.test(src)
  );
  check(
    "declaredValueXaf is untouched by the reading",
    /declaredValueXaf: 0/.test(src)
  );
  check(
    "the estimate only ever grows from what was ticked",
    /setFreeEstimateXaf\(\(v\) => v \+ estimateXaf\)/.test(src)
  );
}

console.log("");
console.log(failures === 0 ? "All good." : `${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
