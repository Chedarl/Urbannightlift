/**
 * Proves that streaming the answer did not loosen anything about it.
 *
 * The assistant did not stream for a real reason: its answer is a JSON object —
 * a reply plus proposed buttons — and that structure is what makes the buttons
 * safe, because each is checked against what the asker actually owns before it
 * is drawn. Streaming naively means either showing a customer raw JSON, or
 * moving the parsing to the browser and with it the guard.
 *
 * Neither happens. `partialReply` pulls the growing `reply` string out of the
 * incomplete JSON on the server, the words go out as they arrive, and the whole
 * object still lands at the end where every existing guard runs on it unchanged.
 *
 * What is proved here is the reader, because it is the only new thing standing
 * between a model and a customer's screen: it must never show a fragment of
 * JSON, a half-written escape, or the contents of a field that is not `reply`.
 *
 * Run: npx tsx scripts/verify-stream.ts
 */
import { partialReply, streamDelta, sse } from "../src/lib/ai/partial";
import { acceptFollowUps } from "../src/lib/ai/assistant/context";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nThe reply, as it is being written");
const full = '{"reply":"Biyem-Assi is 1,500 XAF.","actions":[]}';
check("a complete object reads out", partialReply(full) === "Biyem-Assi is 1,500 XAF.");
check("nothing yet is nothing shown", partialReply("{") === "");
check('the key without a value is still nothing', partialReply('{"reply"') === "");
check("an opened string is empty, not broken", partialReply('{"reply":"') === "");
check("a few characters in", partialReply('{"reply":"Biyem') === "Biyem");
check(
  "every prefix of a real answer is a clean prefix of the text",
  Array.from({ length: full.length }, (_, i) => partialReply(full.slice(0, i))).every(
    (p) => "Biyem-Assi is 1,500 XAF.".startsWith(p)
  ),
  "one bad prefix is a fragment of JSON appearing in a customer's chat"
);

console.log("\nAnd never a fragment of anything else");
check(
  "the actions array never leaks in",
  !partialReply('{"reply":"Done.","actions":[{"kind":"TRACK_ORDER"').includes("TRACK_ORDER"),
  "the buttons are decided by the server after checking them, not by whatever streamed past"
);
check(
  "a reply that mentions a quote is not cut short at it",
  partialReply('{"reply":"They said \\"open\\" tonight","actions":[]}') === 'They said "open" tonight'
);
check(
  "an escaped newline becomes a newline",
  partialReply('{"reply":"One.\\nTwo."') === "One.\nTwo."
);
check(
  "a stream stopped on a lone backslash shows nothing extra",
  partialReply('{"reply":"almost\\') === "almost",
  "a stray backslash flickering on screen is the model looking broken"
);
check(
  "a half-written unicode escape is held back",
  partialReply('{"reply":"caf\\u00') === "caf"
);
check(
  "and completes once it arrives",
  partialReply('{"reply":"caf\\u00e9') === "café"
);

console.log("\nOne SSE line at a time");
check(
  "a content delta comes through",
  streamDelta('data: {"choices":[{"delta":{"content":"hello"}}]}') === "hello"
);
check("the done marker is not content", streamDelta("data: [DONE]") === null);
check("a keep-alive is not content", streamDelta("") === null);
check("a comment line is not content", streamDelta(": ping") === null);
check(
  "a line we cannot parse is ignored rather than shown",
  streamDelta("data: {not json") === null,
  "a parse error mid-stream must never put JSON in front of a customer"
);
check(
  "an empty delta is not a delta",
  streamDelta('data: {"choices":[{"delta":{"content":""}}]}') === null
);

console.log("\nOur own framing");
check("an event is two lines and a blank", sse("delta", { text: "x" }) === 'event: delta\ndata: {"text":"x"}\n\n');
check(
  "a reply containing a newline cannot break the framing",
  sse("delta", { text: "a\nb" }).split("\n\n").length === 2,
  "an unescaped newline in a payload would end the event early and drop the rest"
);

console.log("\nFollow-ups are chips, not a channel");
check("three at most", acceptFollowUps(["a question?", "b question?", "c question?", "d?"]).length === 3);
check("nothing is not an array", acceptFollowUps("what next?").length === 0);
check("junk is dropped", acceptFollowUps([null, 5, "", "hi"]).length === 0);
check(
  "a long one is cut, not dropped",
  acceptFollowUps(["x".repeat(200)])[0].length === 60,
  "these sit on a button on a 390px screen"
);
check(
  "the same question twice is one chip",
  acceptFollowUps(["What time do you close?", "what time do you close?"]).length === 1
);

console.log(
  `\n${failures === 0 ? "It reads as it writes, and shows nothing it should not." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
