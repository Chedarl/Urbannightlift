/**
 * Proves that the things this product says it does are actually reachable.
 *
 * ## The defect this exists to catch
 *
 * Five separate times now, something in this codebase has been written,
 * carefully documented, proved by its own test suite, and **never called by
 * anything**:
 *
 *  - `riderSettlementForOrder` — written, proved, both call sites still on the
 *    old function that recorded a rider as owing money they had advanced.
 *  - `src/lib/riders/float.ts` — its only importer was its own verify script.
 *  - `CustomerAddress` — a model with no reader and no writer.
 *  - `loadDraft()` — one importer, and it was not an order form, so
 *    "just tell us what you need" could never have worked.
 *  - `pruneRateLimits` — zero callers, while the schema comment beside the
 *    table read *"pruned by the nightly housekeeping, so this never grows
 *    without bound."*
 *
 * Every one of those passed `tsc`, passed lint, passed its own tests, and read
 * correctly to anybody reviewing the file. The failure is invisible from inside
 * the module — you have to look outward, at whether anybody calls in.
 *
 * So this suite does that, for the handful of functions where being uncalled is
 * not untidiness but a silent operational failure. It is a grep, and a grep is
 * exactly the right shape of check for "does anything import this".
 *
 * Run: npx tsx scripts/verify-wiring.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

/** Every source file, minus the verify scripts — a test is not a caller. */
function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sources(path, out);
    } else if (/\.tsx?$/.test(entry) && !entry.startsWith("verify-")) {
      out.push(path);
    }
  }
  return out;
}

const FILES = [...sources("src"), ...sources("scripts")];
const RAW = new Map(FILES.map((f) => [f, readFileSync(f, "utf8")]));

/**
 * The same file with every comment removed.
 *
 * This matters more than it looks, and the first draft of this suite got it
 * wrong: a check for "does anything call `spendCredit`" passed because a
 * *comment* elsewhere said the words "spendCredit had no caller". A wiring
 * check that counts prose as wiring is worse than no check — it reports green
 * precisely when somebody has written a careful note about the thing being
 * broken.
 */
const CODE = new Map(
  FILES.map((f) => [
    f,
    RAW.get(f)!
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 "),
  ])
);

/** Files with real code — not a comment — naming a symbol they did not define. */
function callers(symbol: string, definedIn: string): string[] {
  const re = new RegExp(`\\b${symbol}\\b`);
  return FILES.filter((f) => f !== definedIn && re.test(CODE.get(f)!));
}

/**
 * Files that actually **invoke** it, not merely import it.
 *
 * The distinction earns its place: an import left behind after the call site
 * was removed still satisfies "something references this", and the second
 * draft of this suite proved it by staying green when the housekeeping call was
 * deleted and its import was not.
 */
function invocations(symbol: string, definedIn: string): string[] {
  const re = new RegExp(`\\b${symbol}\\s*\\(`);
  return FILES.filter((f) => f !== definedIn && re.test(CODE.get(f)!));
}

const TEXT = CODE;

console.log("\nThe jobs that only matter if something runs them");
for (const [symbol, definedIn, why] of [
  [
    "pruneRateLimits",
    "src/lib/security/rateLimit.ts",
    "RateLimitHit grows forever, the limiter's count() slows, and because it fails open, rate limiting silently stops",
  ],
  [
    "runHousekeeping",
    "src/lib/maintenance/housekeeping.ts",
    "nothing is ever swept and the retention promise on the privacy page stops being true",
  ],
  [
    "sendNightlySummary",
    "src/lib/email/nightlySummary.ts",
    "the owner never finds out how the night went",
  ],
] as [string, string, string][]) {
  const found = invocations(symbol, definedIn);
  check(`${symbol} is actually invoked`, found.length > 0, `nothing calls it — ${why}`);
}

console.log("\nThe money paths, which must reach a real column");
for (const [symbol, definedIn, why] of [
  [
    "creditToApply",
    "src/lib/referrals/rules.ts",
    "the bound on how much credit one order may absorb is not being applied anywhere",
  ],
  [
    "riderSettlementFromOrder",
    "src/lib/orders/earnings.ts",
    "a rider who advanced their own cash on a shopping order is recorded as owing us money",
  ],
  [
    "dispatchBlocker",
    "src/lib/orders/dispatchRules.ts",
    "a rider could be sent out before the money side is settled",
  ],
  [
    "canChargeToFloat",
    "src/lib/merchants/float.ts",
    "a merchant's float is granted and never actually charged against",
  ],
] as [string, string, string][]) {
  const found = invocations(symbol, definedIn);
  check(`${symbol} reaches a call site`, found.length > 0, why);
}

console.log("\nThe fee, wired end to end");
{
  const route = TEXT.get("src/app/api/orders/route.ts") ?? "";
  check(
    "the server prices the order itself rather than trusting the browser",
    route.includes("estimateDeliveryFee("),
    "a fee the client sent is a fee the client chose"
  );
  check(
    "and passes both ends' coordinates to it",
    route.includes("pickup: pickupPoint") && route.includes("delivery: deliveryPoint"),
    "without the pins the fee falls back to a zone-only estimate and the customer is charged something else"
  );
  check(
    "the payable is net of whatever was discounted",
    /amountXaf:\s*Math\.max\(0,\s*payableNowXaf\s*-\s*discountXaf\)/.test(route),
    "the discount was written onto the order and the customer was charged the gross — the ambassador was paid a commission on a saving nobody received"
  );
}

console.log("\nA merchant's pickup line can never read as a broken field");
{
  const bad = FILES.filter((f) => /\$\{[^}]*\.merchantName\}\s*—\s*\$\{[^}]*\.address\}/.test(CODE.get(f)!));
  check(
    "nothing interpolates the optional address straight into the pickup label",
    bad.length === 0,
    `${bad.join(", ")} — Merchant.address is nullable by design, so this renders "Cake Princess — null" and sends a rider to it`
  );
  check(
    "there is one helper that decides it",
    invocations("merchantPickupLabel", "src/lib/merchants/complete.ts").length >= 2,
    "the order route and the order form must agree about where a rider is being sent"
  );
}

console.log("\nEvery scheduled endpoint is actually scheduled");
{
  // A cron route with nothing calling it is the same defect as an uncalled
  // function, and harder to spot: the file exists, the handler is correct, and
  // it never runs. Both schedulers count — Vercel for the daily job, GitHub
  // Actions for the ten-minute one the Hobby plan refused.
  const vercel = readFileSync("vercel.json", "utf8");
  const workflows = readdirSync(".github/workflows")
    .map((f) => readFileSync(join(".github/workflows", f), "utf8"))
    .join("\n");
  const scheduled = (path: string) => vercel.includes(path) || workflows.includes(path);

  for (const [path, why] of [
    ["/api/cron/nightly-summary", "the owner never finds out how the night went"],
    ["/api/cron/watch", "a stalled order is noticed by the customer rather than by us"],
  ] as [string, string][]) {
    check(`${path} has a schedule`, scheduled(path), `nothing fires it — ${why}`);
  }
}

console.log("\nEvery form that sets a trap has a server that reads it");
{
  // Three public join forms rendered a hidden `companyWebsite` input and not one
  // of their routes ever looked at it — `merchant-signup` even imported the
  // checker without calling it. A trap nobody checks is a hidden input.
  const TRAPPED: [string, string][] = [
    ["src/components/merchant/MerchantSignupForm.tsx", "src/app/api/merchant-signup/route.ts"],
    ["src/components/ambassador/AmbassadorJoinForm.tsx", "src/app/api/ambassador-signup/route.ts"],
    ["src/components/rider/RiderJoinForm.tsx", "src/app/api/rider-applications/route.ts"],
  ];
  for (const [form, route] of TRAPPED) {
    const setsIt = /companyWebsite/.test(CODE.get(form) ?? "");
    const readsIt = /trippedHoneypot\s*\(/.test(CODE.get(route) ?? "");
    check(
      `${route.split("/").slice(-2)[0]} reads the honeypot its form sets`,
      !setsIt || readsIt,
      "the field is rendered and the server ignores it, so every bot submission is accepted"
    );
  }
}

console.log("\nThe promises in the schema are kept");
{
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const claimsPruning = /pruned by the nightly housekeeping/.test(schema);
  check(
    "the pruning the schema claims actually has an implementation",
    !claimsPruning || invocations("pruneRateLimits", "src/lib/security/rateLimit.ts").length > 0,
    "a comment describing behaviour is not behaviour"
  );
}

console.log(
  `\n${failures === 0 ? "Everything that claims to run is reachable from something that runs it." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
