/**
 * Proves the panel can say **which** key it is using without ever showing it.
 *
 * Three rounds of this project went: "the key is still not working" → I change
 * something → it is still not working. On the third the owner said the key is
 * set *"in both but with different names"*, which is very probably the whole
 * bug — and it was invisible, because nothing anywhere asked which variable the
 * key came from. `kimiConfigured()` only ever asked whether *a* key existed.
 *
 * Naming the variable and showing four characters fixes that, and immediately
 * creates the risk this file exists to rule out: a diagnostic that leaks the
 * thing it is diagnosing. A key has already reached a browser once in this
 * project.
 *
 * Run: npx tsx scripts/verify-kimi-key.ts
 */
import { kimiKeySource, unreadKeyVariables, droppableField, KEY_VARIABLES } from "../src/lib/ai/kimi";
import { redactSecrets } from "../src/lib/redact";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const KEY = "sk-m985S68h5mnE6FRPoAIA5X9UtN5psmnG856dAWiIpbzk";

function reset() {
  for (const v of KEY_VARIABLES) delete process.env[v];
  for (const v of Object.keys(process.env)) {
    if (/kimi|moonshot/i.test(v)) delete process.env[v];
  }
}

console.log("\nWhich key, named");
reset();
process.env.KIMI_API_KEY = KEY;
let src = kimiKeySource();
check("the variable is named", src.variable === "KIMI_API_KEY", String(src.variable));
check("the key is found", src.key === KEY);

reset();
process.env.MOONSHOT_API_KEY = KEY;
src = kimiKeySource();
check("the second name works too", src.variable === "MOONSHOT_API_KEY");

reset();
process.env.KIMI_API_KEY = "sk-first";
process.env.MOONSHOT_API_KEY = "sk-second";
check("KIMI_API_KEY wins when both are set", kimiKeySource().key === "sk-first");

reset();
check("nothing set is reported as nothing", kimiKeySource().variable === null);

console.log("\nThe fingerprint cannot become the key");
reset();
process.env.KIMI_API_KEY = KEY;
const fp = kimiKeySource().fingerprint!;
check("four characters, no more", fp.length === 4, fp);
check("they are the last four", KEY.endsWith(fp));
check(
  "the key cannot be reconstructed from it",
  !KEY.includes(fp + "x") && fp.length < KEY.length / 4,
  "four of forty-six characters is a recognition aid, not a credential"
);
check(
  "and the prefix — the guessable part — is never shown",
  !fp.startsWith("sk-"),
  "showing the FIRST four would leak nothing but identify nothing either; every key starts sk-"
);

console.log("\nA key under a name nothing reads");
reset();
process.env.KIMI_CODE_KEY = KEY;
process.env.MOONSHOT_KEY = KEY;
process.env.KIMI_MODEL = "kimi-k3";
process.env.KIMI_REASONING_EFFORT = "low";
const unread = unreadKeyVariables();
check("the misnamed ones are reported", unread.includes("KIMI_CODE_KEY") && unread.includes("MOONSHOT_KEY"), unread.join(", "));
check("real settings are not cried wolf about", !unread.includes("KIMI_MODEL") && !unread.includes("KIMI_REASONING_EFFORT"));
check(
  "by NAME only — never the value",
  unread.every((n) => !n.includes(KEY)) && !unread.join(" ").includes("sk-"),
  "this warning exists to be read on a screen; it must not carry the secret onto it"
);
reset();
check("an empty variable is not reported", (process.env.KIMI_SPARE = "") === "" && !unreadKeyVariables().includes("KIMI_SPARE"));

console.log("\nA parameter the model refuses");
// Moonshot's actual wording, from the owner's screenshot.
const REAL = "invalid temperature: only 1 is allowed for this model";
check(
  "temperature is picked out of the real message",
  droppableField(REAL, ["model", "temperature", "max_tokens"]) === "temperature",
  String(droppableField(REAL, ["model", "temperature", "max_tokens"]))
);
check(
  "a field we did not send is never dropped",
  droppableField(REAL, ["model", "max_tokens"]) === null,
  "dropping something that was not in the body would retry an identical request"
);
check(
  "reasoning_effort likewise",
  droppableField("unsupported parameter: reasoning_effort", ["reasoning_effort"]) === "reasoning_effort"
);
check(
  "an unrelated 400 drops nothing",
  droppableField("Incorrect API key provided", ["temperature", "reasoning_effort", "response_format"]) === null,
  "a bad key must not be mistaken for a bad parameter — retrying would waste a call and hide the real reason"
);
check(
  "and a field we send but must never drop stays",
  droppableField("messages is required", ["messages", "model"]) === null,
  "only the optional three are droppable; the request cannot be retried without its messages"
);

console.log("\nRedaction still holds over everything above");
check("the whole key", !redactSecrets(`key ${KEY}`).includes(KEY));
check(
  "but four characters survive, because they are not a secret",
  redactSecrets(`ending ${fp}`) === `ending ${fp}`,
  "if the fingerprint were scrubbed the panel would show nothing and we would be back where we started"
);

console.log(
  `\n${failures === 0 ? "The panel can name the key without showing it." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
