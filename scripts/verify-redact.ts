/**
 * Proves that a credential cannot ride out inside an error message.
 *
 * Not hypothetical. A Kimi API key was pasted into Vercel six times over, which
 * made an `Authorization` header containing spaces; `Headers.append` refused it
 * and threw an error quoting **the whole header back**. That message went into
 * `AiCall.error` and was rendered on `/admin/settings`. The key reached the
 * database and a browser.
 *
 * The habit behind it is worth keeping — this codebase quotes provider errors
 * verbatim on purpose, and that exact wording has turned a silent failure into a
 * five-second diagnosis three times this month. So the fix is to scrub on the
 * way in rather than to stop quoting, and the scrubbing is checked here against
 * the shapes that actually appear.
 *
 * Run: npx tsx scripts/verify-redact.ts
 */
import { redactSecrets } from "../src/lib/redact";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

/** The exact shape that leaked, key altered. */
const LEAKED_KEY = "sk-m985S68h5mnE6FRPoAIA5X9UtN5psmnG856dAWiIpbzkNnL1";
const REAL_ERROR = `Headers.append: "Bearer ${LEAKED_KEY} ${LEAKED_KEY} ${LEAKED_KEY}" is an invalid header value.`;

console.log("\nThe message that actually leaked");
const scrubbed = redactSecrets(REAL_ERROR);
check("the key is gone", !scrubbed.includes(LEAKED_KEY), scrubbed);
check("every repetition is gone", !/sk-m985/.test(scrubbed), scrubbed);
check(
  "and it still says what went wrong",
  /invalid header value/i.test(scrubbed),
  "redaction must not destroy the diagnosis — that is the whole reason errors are quoted"
);

console.log("\nOther shapes a credential arrives in");
check("a bare key", !redactSecrets(`key was ${LEAKED_KEY}`).includes(LEAKED_KEY));
check(
  "a bearer header on its own",
  redactSecrets("Authorization: Bearer abcdef0123456789abcdef").includes("Bearer ***")
);
check(
  "a key in a query string — every map provider uses this shape",
  !redactSecrets("https://api.maptiler.com/maps/x/1/2/3.png?key=oza2tPrbJVJtSLo8jzYb").includes(
    "oza2tPrbJVJtSLo8jzYb"
  )
);
check(
  "an api_key parameter",
  !redactSecrets("GET /v1/thing?api_key=SUPERSECRETVALUE123456&x=1").includes("SUPERSECRETVALUE123456")
);
check(
  "a long opaque token with no prefix at all",
  !redactSecrets(`token ${"a1B2c3D4e5".repeat(5)} rejected`).includes("a1B2c3D4e5a1B2c3D4e5")
);

console.log("\nOrdinary messages survive intact");
// Over-redaction has a cost too: these are the messages that have each saved a
// day, and mangling them would trade one failure mode for another.
for (const message of [
  "API keys with referer restrictions cannot be used with this API",
  "You can only send testing emails to your own email address (urbannightlift@gmail.com).",
  'Not found - Map with this identifier does not exist',
  "MapTiler has no style called \"dark-matter\"",
  "No answer within 15s.",
]) {
  check(`"${message.slice(0, 44)}…" unchanged`, redactSecrets(message) === message, redactSecrets(message));
}

console.log("\nIt is safe to run on anything");
check("empty string", redactSecrets("") === "");
check("no false positives on a normal sentence", redactSecrets("the rider is late") === "the rider is late");
check(
  "an order code is not mistaken for a secret",
  redactSecrets("order UNL-4821 failed") === "order UNL-4821 failed"
);

console.log(
  `\n${failures === 0 ? "A key cannot reach the log, and the diagnosis still survives." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
