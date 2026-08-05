import "server-only";

import { prisma } from "@/lib/prisma";
import { redactSecrets } from "@/lib/redact";
import { streamDelta } from "@/lib/ai/partial";

/**
 * The one way this product talks to a model.
 *
 * Kimi (Moonshot) is OpenAI-compatible, so this is a `fetch` and nothing more —
 * no SDK, no dependency, no version to keep up with. What the module is really
 * for is the discipline around the call, because a model is the least
 * predictable thing in this codebase and everything else here is deterministic
 * and proven.
 *
 * ## Three rules, and they are not negotiable
 *
 * **1. Never on the critical path.** Every function returns `null` rather than
 * throwing — bad JSON, a refusal, a timeout, no key configured. A null means the
 * caller does exactly what it did before any of this existed. An order must
 * never fail because a model did.
 *
 * **2. The shape is checked before a caller sees it.** `response_format:
 * json_schema` makes Moonshot constrain the output, and we validate again on
 * arrival anyway. A half-parsed object reaching the address resolver or a money
 * screen is worse than no answer at all, and "it usually returns the right
 * shape" is not a property you can build on.
 *
 * **3. It never decides.** Nothing here commits money, verifies a payment,
 * publishes a price or rejects an order. It extracts, suggests and explains; a
 * human presses the button. That rule lives in the callers, but it is written
 * here because it is the reason this module is allowed to exist.
 *
 * ## The model id is pinned, deliberately
 *
 * `moonshot-v1-*` and K2.5 are withdrawn on **31 August 2026**, and the
 * `-vision-preview` models go with them — so building on the ids that appear
 * most often in older examples would mean a product that stops working four
 * weeks from now. `kimi-k3` is current and does vision natively.
 */

const DEFAULT_MODEL = "kimi-k3";
const DEFAULT_BASE = "https://api.moonshot.ai/v1";

/**
 * How hard the model thinks before answering — and why this is not the default.
 *
 * K3 is a reasoning model and its default `reasoning_effort` is **max**. It
 * spends tokens thinking before it writes a single character of the answer, so
 * a request with a modest token budget can burn the whole allowance reasoning
 * and return **empty content while still being billed**. That is precisely how
 * this looked when it was first tested: no answer, a sub-second-looking
 * failure, and real consumption on the account. It reads exactly like a dead
 * key and is nothing of the sort.
 *
 * Every call in this product is extraction — read this receipt, pick the
 * matching place, structure this sentence. None of it benefits from deep
 * deliberation, and all of it wants to be fast and cheap, because it sits
 * beside a rider at a counter or a customer typing an address.
 */
const DEFAULT_EFFORT = "low";

/**
 * Generous on purpose. The failure this prevents is silent: too small a budget
 * on a reasoning model does not error, it returns nothing.
 */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * How long to wait, and why it is not one number.
 *
 * A trivial text question measured **5.4 seconds** against the live key. A
 * photographed price board is a far larger prompt and a far harder read, so a
 * flat 15 seconds meant vision calls timed out and reported themselves as
 * *"couldn't read that photo"* — sending somebody off to retake a photograph
 * that was perfectly good.
 */
const TEXT_TIMEOUT_MS = 20_000;
const IMAGE_TIMEOUT_MS = 60_000;

/**
 * The key, under either name.
 *
 * The repository's Kimi workflow was written against `MOONSHOT_API_KEY` and this
 * client against `KIMI_API_KEY`, which meant a key could be correctly set in one
 * place and invisible to the other — the app would report itself unconfigured
 * while a GitHub secret sat there working. Accepting both costs one line and
 * removes a trap that is very hard to see from the outside.
 */
/** The only two names a key is read from. Anything else is invisible here. */
export const KEY_VARIABLES = ["KIMI_API_KEY", "MOONSHOT_API_KEY"] as const;

export function kimiKey(): string | null {
  return kimiKeySource().key;
}

/**
 * Which variable the key came from, and the last four characters of it.
 *
 * Added because "the key is still not working" has now cost three rounds, and
 * on the third the owner said the key is set *"in both but with different
 * names"*. That single sentence is very likely the whole bug: a key saved under
 * a third name is invisible to this function, the old one keeps being sent, and
 * every screen in the product still says a key is configured — because
 * `kimiConfigured()` only ever asked whether *a* key exists, never **which**.
 *
 * So the panel now names the variable and shows four characters. Four is what
 * Stripe and AWS show for the same reason: it is enough to recognise a key you
 * are holding and useless to anybody who is not.
 */
export function kimiKeySource(): {
  key: string | null;
  variable: (typeof KEY_VARIABLES)[number] | null;
  fingerprint: string | null;
} {
  for (const variable of KEY_VARIABLES) {
    const raw = process.env[variable] || "";
    // Take the first token only.
    //
    // A key pasted twice — or six times, which is what actually happened —
    // makes an `Authorization` value containing spaces, and `Headers.append`
    // rejects it outright: the request never leaves, and the thrown message
    // quotes the whole header back. Trimming to the first whitespace-delimited
    // token turns a very easy paste mistake into a non-event.
    const key = raw.trim().split(/\s+/)[0];
    if (key) return { key, variable, fingerprint: key.slice(-4) };
  }
  return { key: null, variable: null, fingerprint: null };
}

/**
 * Config that is *meant* to carry a name rather than a key. Listing these keeps
 * the warning below from crying wolf about the settings that are working fine.
 */
const KNOWN_SETTINGS = new Set(["KIMI_MODEL", "KIMI_BASE_URL", "KIMI_REASONING_EFFORT"]);

/**
 * Variables that look like a Kimi key but under a name nothing reads.
 *
 * **Names only, never values.** This is the sentence that would have ended the
 * current round on day one: *"MOONSHOT_KEY is set, but this app only reads
 * KIMI_API_KEY or MOONSHOT_API_KEY."* A variable nobody reads is otherwise
 * completely silent — it looks, from every screen and every log, exactly like
 * not having set it at all.
 */
export function unreadKeyVariables(): string[] {
  return Object.keys(process.env)
    .filter(
      (name) =>
        /kimi|moonshot/i.test(name) &&
        !KNOWN_SETTINGS.has(name) &&
        !(KEY_VARIABLES as readonly string[]).includes(name) &&
        (process.env[name] ?? "").trim().length > 0
    )
    .sort();
}

export function kimiConfigured(): boolean {
  return Boolean(kimiKey());
}

export function kimiModel(): string {
  return process.env.KIMI_MODEL || DEFAULT_MODEL;
}

/**
 * Which endpoint we are calling — and this is not decoration.
 *
 * Moonshot runs **two** of them: `api.moonshot.ai` (international, billed in
 * USD) and `api.moonshot.cn` (China). A key issued on one is rejected by the
 * other with `Incorrect API key provided` — the identical message you get for a
 * revoked key, a typo, or a key from somebody else's account. Four different
 * problems, one sentence, so the endpoint has to be on screen next to the key
 * or the message cannot be acted on.
 */
export function kimiBaseUrl(): string {
  return (process.env.KIMI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
}

/** The build this call came from, so an old failure cannot pose as a new one. */
function buildRef(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : null;
}

/**
 * Optional fields we send that a model is entitled to refuse.
 *
 * `temperature` already cost a full round trip through the owner's inbox: K3
 * accepts only 1, refused every call outright, and the feature looked dead. The
 * others are the same shape of risk, still armed. Rather than wait to discover
 * each one from a screenshot, a 400 that names one of these gets **one** retry
 * without it — and the retry is recorded, so a working feature never silently
 * hides the fact that a parameter had to be dropped.
 */
const DROPPABLE = ["temperature", "reasoning_effort", "response_format"] as const;

export function droppableField(message: string, sent: string[]): string | null {
  const lower = message.toLowerCase();
  return sent.find((f) => (DROPPABLE as readonly string[]).includes(f) && lower.includes(f)) ?? null;
}

/** A JSON Schema object describing the answer we will accept. */
export type JsonSchema = Record<string, unknown>;

export interface KimiRequest {
  /** What this call is for. Shown in the admin readout and used to spot cost. */
  purpose: string;
  /** The system instruction — what it is, and what it must never do. */
  system: string;
  /** The actual question, including whatever context the caller gathered. */
  user: string;
  /** Absolute image URLs. Signed and short-lived when the source is private. */
  images?: string[];
  schema: JsonSchema;
  entityType?: string;
  entityId?: string;
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { total_tokens?: number };
  error?: { message?: string };
}

/**
 * Asks for one JSON answer, or returns null.
 *
 * The caller supplies the schema and gets back either something matching it or
 * nothing. There is no third outcome, which is the whole point — a caller that
 * has to defend against a partially-correct object ends up with the model's
 * unreliability spread through its own logic.
 */
export async function kimiJson<T>(req: KimiRequest): Promise<T | null> {
  return (await kimiJsonResult<T>(req)).answer;
}

export interface KimiResult<T> {
  answer: T | null;
  /** Why it failed, in the provider's own words where there are any. */
  error: string | null;
  ms: number;
}

/**
 * The same call, with the reason kept instead of thrown away.
 *
 * `kimiJson` returning a bare `null` is right for every feature — a caller
 * should not have to think about *why* the model was unavailable. But it made
 * the one screen built to answer "why is this failing" unable to do so: the
 * test button could only say *"the reason is in the failures list below"* and
 * point at an undated list. Three rounds of "the key still is not working" went
 * past on that. So the reason is now available to anything that asks for it,
 * and `kimiJson` stays exactly as simple as it was.
 */
export async function kimiJsonResult<T>(req: KimiRequest): Promise<KimiResult<T>> {
  const { key, variable } = kimiKeySource();
  if (!key) {
    // Not an error. The product is expected to run without a model configured,
    // and it is logged so the gap is visible rather than assumed.
    const error = "No KIMI_API_KEY or MOONSHOT_API_KEY is set";
    await record(req, { ok: false, ms: 0, error });
    return { answer: null, error, ms: 0 };
  }

  const started = Date.now();

  const content: unknown[] = [{ type: "text", text: req.user }];
  for (const url of req.images ?? []) {
    content.push({ type: "image_url", image_url: { url } });
  }
  const timeoutMs = (req.images?.length ?? 0) > 0 ? IMAGE_TIMEOUT_MS : TEXT_TIMEOUT_MS;

  // Built as an object rather than inline, so a field the provider rejects can
  // be removed and the call retried once. No `temperature`: K3 accepts only 1
  // and refuses anything else outright, which is what the live key returned the
  // moment it was finally accepted.
  const body: Record<string, unknown> = {
    model: kimiModel(),
    max_tokens: DEFAULT_MAX_TOKENS,
    reasoning_effort: process.env.KIMI_REASONING_EFFORT || DEFAULT_EFFORT,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content },
    ],
    // Deliberately not `strict: true`. Strict mode requires every property to
    // be listed in `required` and `additionalProperties: false` throughout —
    // which would mean no optional fields and a provider-side 400 for any
    // schema that has one. Since the answer is validated against the same
    // schema on arrival either way, the looser form buys the same safety
    // without a class of rejection that would show up as "the feature silently
    // does nothing".
    response_format: {
      type: "json_schema",
      json_schema: { name: "answer", schema: req.schema },
    },
  };

  let dropped: string | null = null;

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${kimiBaseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const data = (await res.json().catch(() => null)) as ChatResponse | null;
      const ms = Date.now() - started;

      if (!res.ok) {
        const provider = data?.error?.message ?? `Kimi refused the call (HTTP ${res.status}).`;

        // A 400 naming a parameter we sent is our request being wrong, not the
        // key. Drop that field and try once more rather than reporting a dead
        // feature — exactly the failure `temperature` caused.
        const field = res.status === 400 ? droppableField(provider, Object.keys(body)) : null;
        if (field && attempt === 0) {
          delete body[field];
          dropped = field;
          continue;
        }

        // Their wording distinguishes a bad key from a withdrawn model from a
        // spent balance, and those need three different fixes. The endpoint is
        // named alongside it because `Incorrect API key provided` is also what
        // a valid .cn key gets from the .ai endpoint.
        const error = `${provider} (${variable}, ${kimiBaseUrl()})`;
        await record(req, { ok: false, ms, error });
        return { answer: null, error, ms };
      }

      const text = data?.choices?.[0]?.message?.content;
      if (!text) {
        // Named precisely, because the obvious reading of this is wrong. An
        // empty completion from a reasoning model usually means the token
        // budget went on thinking — the call succeeded and was billed. It is
        // not a bad key.
        const error =
          "Kimi answered but the content was empty — usually the token budget was spent on reasoning. Lower KIMI_REASONING_EFFORT or raise max_tokens. The call was still billed.";
        await record(req, { ok: false, ms, tokens: data?.usage?.total_tokens, error });
        return { answer: null, error, ms };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        const error = "Kimi returned something that is not JSON.";
        await record(req, { ok: false, ms, error });
        return { answer: null, error, ms };
      }

      // Schema-constrained output is a request, not a guarantee. Checked again
      // on arrival, because the alternative is a malformed object reaching a
      // screen that shows somebody money.
      if (!matchesSchema(parsed, req.schema)) {
        const error = "Kimi's answer did not match the requested shape.";
        await record(req, { ok: false, ms, error });
        return { answer: null, error, ms };
      }

      await record(req, {
        ok: true,
        ms,
        tokens: data?.usage?.total_tokens,
        // A success that only happened because a parameter was removed is still
        // worth knowing about — silently working around a provider change is
        // how the next surprise gets buried.
        note: dropped ? `answered after dropping ${dropped}` : undefined,
      });
      return { answer: parsed as T, error: null, ms };
    }

    // Unreachable: the loop returns on every path.
    return { answer: null, error: "No answer.", ms: Date.now() - started };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    // A timeout is by far the most common failure and reads as nonsense
    // otherwise ("The operation was aborted").
    const error = /abort|timeout/i.test(message)
      ? `No answer within ${timeoutMs / 1000}s.`
      : message;
    const ms = Date.now() - started;
    await record(req, { ok: false, ms, error });
    return { answer: null, error, ms };
  }
}

/**
 * Enough schema checking to catch a wrong answer, not a full validator.
 *
 * Deliberately shallow: required keys must be present and their primitive types
 * must match. That is what actually goes wrong — a missing field, or a number
 * arriving as prose — and a complete JSON Schema implementation here would be a
 * dependency and a maintenance burden for no extra safety on the shapes this
 * product asks for.
 */
export function matchesSchema(value: unknown, schema: JsonSchema): boolean {
  const type = schema.type as string | undefined;

  if (type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
    const required = (schema.required ?? []) as string[];
    const row = value as Record<string, unknown>;

    for (const key of required) {
      if (!(key in row)) return false;
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in row && row[key] !== null && !matchesSchema(row[key], sub)) return false;
    }
    return true;
  }

  if (type === "array") {
    if (!Array.isArray(value)) return false;
    const items = schema.items as JsonSchema | undefined;
    return !items || value.every((v) => v === null || matchesSchema(v, items));
  }

  if (type === "string") return typeof value === "string";
  if (type === "number" || type === "integer") return typeof value === "number";
  if (type === "boolean") return typeof value === "boolean";

  // No `type` given — the caller did not constrain it, so nothing to check.
  return true;
}

async function record(
  req: KimiRequest,
  outcome: { ok: boolean; ms: number; tokens?: number; error?: string; note?: string }
): Promise<void> {
  try {
    await prisma.aiCall.create({
      data: {
        purpose: req.purpose,
        model: kimiModel(),
        ok: outcome.ok,
        ms: outcome.ms,
        tokens: outcome.tokens ?? null,
        // Which build made the call. Without this a failure from a fixed bug is
        // indistinguishable on screen from one happening right now, which is
        // precisely how the last three rounds were spent.
        buildRef: buildRef(),
        // Redacted here rather than at each call site: this is the single
        // funnel every error passes through on its way to storage, and a
        // provider message quoted verbatim is exactly how a key got out.
        error: outcome.error
          ? redactSecrets(outcome.error).slice(0, 500)
          : outcome.note
            ? redactSecrets(outcome.note).slice(0, 500)
            : null,
        entityType: req.entityType ?? null,
        entityId: req.entityId ?? null,
      },
    });
  } catch {
    // A lost log line must never take down the request it was describing —
    // the same rule the email log has followed since it was written.
  }
}

/**
 * The same call, streamed.
 *
 * A grounded answer takes five to eight seconds on this key, and a spinner for
 * that long reads as broken however honest it is. Streaming does not change
 * what the model may say or what the caller may do with it: the request is
 * identical — same system prompt, same `json_schema`, same model — and the
 * answer is still one JSON object. The only difference is that the caller can
 * watch it being written.
 *
 * The complete text is handed back at the end so the caller parses and validates
 * exactly as `kimiJsonResult` does. **No guardrail moves to the browser**; the
 * partial text is for reading, and the whole object is still what decides which
 * buttons exist.
 *
 * Errors are reported through `onError` rather than thrown, because by the time
 * one arrives the response has usually started and there is nothing to throw to.
 */
export async function kimiStream(
  req: KimiRequest,
  handlers: { onDelta: (text: string) => void }
): Promise<KimiResult<string>> {
  const { key, variable } = kimiKeySource();
  if (!key) {
    return { answer: null, error: "No KIMI_API_KEY or MOONSHOT_API_KEY is set", ms: 0 };
  }

  const started = Date.now();
  const body: Record<string, unknown> = {
    model: kimiModel(),
    max_tokens: DEFAULT_MAX_TOKENS,
    reasoning_effort: process.env.KIMI_REASONING_EFFORT || DEFAULT_EFFORT,
    stream: true,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: [{ type: "text", text: req.user }] },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "answer", schema: req.schema },
    },
  };

  try {
    const res = await fetch(`${kimiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TEXT_TIMEOUT_MS),
    });

    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => null)) as ChatResponse | null;
      const error = `${data?.error?.message ?? `Kimi refused the call (HTTP ${res.status}).`} (${variable}, ${kimiBaseUrl()})`;
      await record(req, { ok: false, ms: Date.now() - started, error });
      return { answer: null, error, ms: Date.now() - started };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let whole = "";
    // Chunks split anywhere, including mid-line, so the tail is carried over.
    let pending = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const delta = streamDelta(line);
        if (delta) {
          whole += delta;
          handlers.onDelta(delta);
        }
      }
    }

    const ms = Date.now() - started;
    if (!whole) {
      const error =
        "Kimi answered but the content was empty — usually the token budget was spent on reasoning.";
      await record(req, { ok: false, ms, error });
      return { answer: null, error, ms };
    }

    await record(req, { ok: true, ms });
    return { answer: whole, error: null, ms };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    const error = /abort|timeout/i.test(message) ? `No answer within ${TEXT_TIMEOUT_MS / 1000}s.` : message;
    const ms = Date.now() - started;
    await record(req, { ok: false, ms, error });
    return { answer: null, error, ms };
  }
}
