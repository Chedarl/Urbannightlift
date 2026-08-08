/**
 * Proves the three guards the audit added, offline.
 *
 * Each exists because of something found by reading the code rather than by a
 * bug report, and each is the kind of rule that is easy to weaken later by
 * accident — which is exactly what a proof script is for.
 *
 *  1. **A stored image may only name our own storage.** An absolute URL in
 *     `Merchant.photoUrl` renders inside an `<img src>` on the *public* food
 *     page, so a merchant could have pointed it at their own server and
 *     collected the IP of every customer who browsed. This is the check that
 *     stops it, and the one most likely to be loosened by somebody who wants a
 *     CDN later.
 *  2. **A honeypot is silent.** Telling a script it was caught teaches it to
 *     stop filling the field, which is the opposite of what a honeypot is for.
 *  3. **Secrets falling back to the repository literal are refused in
 *     production.** The failure mode being guarded against is total compromise
 *     with zero signal, which is the worst combination there is.
 *
 * Run: npx tsx scripts/verify-security.ts
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://mivskfiyjhrzszywbcav.supabase.co";

import { isOwnStorage, mediaSrc } from "../src/lib/uploads/mediaSrc";
import { trippedHoneypot, LIMITS, limitMessage } from "../src/lib/security/rateLimit";
import { secretStatus, secretAdvice, assertProductionSecrets } from "../src/lib/security/secrets";

/** `NODE_ENV` is typed readonly; this suite has to move it to test both sides. */
const env = process.env as Record<string, string | undefined>;

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nA stored picture may only ever be one of ours");
check("a path in our own bucket is ours", isOwnStorage("merchant-logos/abc/logo.png"));
check("so is a rider photo", isOwnStorage("rider-photos/x.jpg"));
check("and an absolute URL on our own Supabase host", isOwnStorage(`${BASE}/storage/v1/object/public/merchant-logos/a.png`));

console.log("\nAnd never anybody else's");
check(
  "another host is refused",
  !isOwnStorage("https://evil.example/beacon.gif"),
  "this is the tracking pixel on the public food page that the audit found"
);
check(
  "a lookalike host is refused",
  !isOwnStorage("https://mivskfiyjhrzszywbcav.supabase.co.evil.example/a.png"),
  "suffix matching rather than host comparison is how this check usually breaks"
);
check("a protocol-relative URL is refused", !isOwnStorage("//evil.example/a.png"));
check("a javascript: scheme is refused", !isOwnStorage("javascript:alert(1)"));
check("a data URI is refused", !isOwnStorage("data:image/png;base64,AAA"));
check("an unknown bucket is refused", !isOwnStorage("some-other-bucket/a.png"));
check("traversal is refused", !isOwnStorage("merchant-logos/../../etc/passwd"));
check("a bare filename is refused", !isOwnStorage("logo.png"));
check("empty is refused", !isOwnStorage("") && !isOwnStorage(null) && !isOwnStorage(undefined));

console.log("\nThe two rules do not disagree with each other");
check(
  "everything our storage accepts, mediaSrc can render",
  ["merchant-logos/a.png", "rider-photos/b.jpg", "goods-receipts/c.jpg"].every(
    (v) => isOwnStorage(v) && mediaSrc(v) !== null
  ),
  "a value the API stores but no screen can draw is a broken image by another route"
);
check(
  "a private bucket is ours, and still goes through the staff gate",
  isOwnStorage("order-screenshots/x.jpg") &&
    mediaSrc("order-screenshots/x.jpg")!.startsWith("/api/media"),
  "being ours must never be confused with being public"
);

console.log("\nThe honeypot is silent, and reads the field that already existed");
check("the merchant form's own field trips it", trippedHoneypot({ companyWebsite: "spam" }));
check("so do the generic ones", trippedHoneypot({ company: "x" }) && trippedHoneypot({ honeypot: "x" }));
check("a real submission does not", !trippedHoneypot({ merchantName: "Cake Princess" }));
check("an empty field does not", !trippedHoneypot({ companyWebsite: "   " }));

console.log("\nLimits are set where a person cannot reach them");
check(
  "ordering is the most generous of all",
  LIMITS.order.max >= Math.max(...Object.values(LIMITS).map((l) => l.max)),
  "a shared mobile NAT in Yaoundé must never stop somebody placing a real order"
);
check("every limit is per hour or longer", Object.values(LIMITS).every((l) => l.windowMinutes >= 60));
check(
  "no limit is tight enough to catch a real person",
  Object.values(LIMITS).every((l) => l.max >= 10),
  "if these are ever wrong they must be wrong towards letting an abuser through"
);
check(
  "the refusal is bilingual",
  limitMessage({ ok: false, retryInMinutes: 5 }, true).includes("Réessayez") &&
    limitMessage({ ok: false, retryInMinutes: 5 }, false).includes("try again")
);

console.log("\nA secret from the repository is refused in production");
{
  const before = { ...process.env };
  for (const k of Object.keys(process.env)) {
    if (/SECRET|DATABASE_URL/.test(k)) delete process.env[k];
  }
  const rows = secretStatus();
  check("with nothing set, every chain reports the literal", rows.every((r) => r.usingLiteral));
  check("and the advice says so plainly", (secretAdvice(rows) ?? "").includes("published in this repository"));

  env.NODE_ENV = "production";
  let threw = false;
  try {
    assertProductionSecrets();
  } catch {
    threw = true;
  }
  check(
    "production refuses to start",
    threw,
    "a site that will not boot beats one that boots with forgeable sessions"
  );

  env.NODE_ENV = "development";
  let threwInDev = false;
  try {
    assertProductionSecrets();
  } catch {
    threwInDev = true;
  }
  check("development still runs", !threwInDev, "a clone of this repo has to work with no setup");

  Object.assign(process.env, before);
}

console.log("\nAnd a properly configured deployment is quiet");
{
  const before = { ...process.env };
  process.env.CUSTOMER_SESSION_SECRET = "x".repeat(40);
  process.env.MERCHANT_SESSION_SECRET = "y".repeat(40);
  process.env.AMBASSADOR_SESSION_SECRET = "z".repeat(40);
  process.env.ORDER_ACCESS_SECRET = "a".repeat(40);
  process.env.WATCH_LINK_SECRET = "b".repeat(40);
  process.env.MERCHANT_PING_SECRET = "c".repeat(40);

  const rows = secretStatus();
  check("nothing falls back", rows.every((r) => !r.usingLiteral));
  check("each has its own variable", rows.every((r) => r.dedicated));
  check("and there is nothing to advise", secretAdvice(rows) === null);
  check(
    "the name is reported, never the value",
    rows.every((r) => /^[A-Z][A-Z0-9_]*$/.test(r.source ?? "")),
    "every source must be an environment variable NAME — a panel that leaks a secret is worse than no panel"
  );
  check(
    "and no secret value appears anywhere in the payload",
    !JSON.stringify(rows).includes("xxxxx"),
    "the values set above are runs of one letter, so any leak shows up as a run here"
  );

  Object.assign(process.env, before);
}

console.log(
  `\n${failures === 0 ? "Ours only, silent traps, and no secret from the repository." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
