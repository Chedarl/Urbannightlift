/**
 * Reading an answer while it is still being written.
 *
 * The assistant returns a JSON object — a reply plus a set of proposed buttons —
 * and that shape is what makes it safe: the buttons are checked against what the
 * asker actually owns before any of them is drawn. It is also why the answer was
 * never streamed, and why the chat did not feel like one. Five to eight seconds
 * of a spinner reads as broken however honest the spinner is.
 *
 * The way out is not to give up the schema. It is to pull the growing `reply`
 * string out of the incomplete JSON as it arrives, show that, and keep the
 * complete object for everything else once it lands. The words appear as they
 * are written; the guardrails run exactly as before, on a whole object, at the
 * end. Nothing about who may press what changes.
 *
 * Pure and dependency-free, so `scripts/verify-stream.ts` can prove it against
 * truncated payloads — including the ones that would be easy to get wrong, like
 * a cut in the middle of an escape sequence.
 */

/**
 * The `reply` value so far, or "" if it has not started.
 *
 * Deliberately hand-written rather than a partial-JSON parser dependency: only
 * one string is wanted, the shape it sits in is ours, and a scanner that reads
 * a single known key is something the whole of can be held in the head.
 *
 * Escapes are decoded as they go, and a trailing incomplete escape is dropped
 * rather than shown — `\` and `\u26` are not characters anybody should see
 * flicker on screen.
 */
export function partialReply(buffer: string): string {
  const key = '"reply"';
  const at = buffer.indexOf(key);
  if (at === -1) return "";

  // Step past the key, the colon and any whitespace to the opening quote.
  let i = at + key.length;
  while (i < buffer.length && buffer[i] !== '"') {
    // Anything other than a colon or space before the quote means this was not
    // the field we thought it was — a key called "reply" nested somewhere odd.
    if (buffer[i] !== ":" && buffer[i] !== " " && buffer[i] !== "\n" && buffer[i] !== "\r") return "";
    i++;
  }
  if (i >= buffer.length) return "";
  i++; // past the opening quote

  let out = "";
  while (i < buffer.length) {
    const c = buffer[i];

    if (c === "\\") {
      const next = buffer[i + 1];
      // The stream stopped mid-escape. Show nothing for it rather than a stray
      // backslash that will be replaced a moment later.
      if (next === undefined) break;
      if (next === "u") {
        const hex = buffer.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      out += UNESCAPE[next] ?? next;
      i += 2;
      continue;
    }

    // The closing quote: the reply is complete, whatever follows it.
    if (c === '"') break;
    out += c;
    i++;
  }

  return out;
}

const UNESCAPE: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  '"': '"',
  "\\": "\\",
  "/": "/",
};

/**
 * One line of a Moonshot SSE stream, reduced to the text it carries.
 *
 * OpenAI-compatible streams send `data: {…}` lines and a final `data: [DONE]`.
 * Anything else — a comment, a blank keep-alive, a line we cannot parse — is
 * ignored rather than treated as content, because a parse error in the middle
 * of a stream must not put JSON fragments in front of a customer.
 */
export function streamDelta(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return null;
  try {
    const parsed = JSON.parse(payload) as {
      choices?: { delta?: { content?: string } }[];
    };
    const content = parsed.choices?.[0]?.delta?.content;
    return typeof content === "string" && content.length > 0 ? content : null;
  } catch {
    return null;
  }
}

/** Our own event framing, so the browser can tell words from the final answer. */
export function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
