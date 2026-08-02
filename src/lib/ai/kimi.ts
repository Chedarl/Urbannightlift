import "server-only";

import { prisma } from "@/lib/prisma";

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
 * Long enough for a vision call on a photographed receipt, short enough that
 * nobody watches a spinner. Whatever has not answered by now is not going to
 * rescue the request it is attached to.
 */
const TIMEOUT_MS = 15_000;

export function kimiConfigured(): boolean {
  return Boolean(process.env.KIMI_API_KEY);
}

export function kimiModel(): string {
  return process.env.KIMI_MODEL || DEFAULT_MODEL;
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
  /** Near-zero by default: extraction should be repeatable, not creative. */
  temperature?: number;
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
  const key = process.env.KIMI_API_KEY;
  if (!key) {
    // Not an error. The product is expected to run without a model configured,
    // and it is logged so the gap is visible rather than assumed.
    await record(req, { ok: false, ms: 0, error: "KIMI_API_KEY is not set" });
    return null;
  }

  const base = (process.env.KIMI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
  const started = Date.now();

  const content: unknown[] = [{ type: "text", text: req.user }];
  for (const url of req.images ?? []) {
    content.push({ type: "image_url", image_url: { url } });
  }

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: kimiModel(),
        temperature: req.temperature ?? 0.1,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "answer", strict: true, schema: req.schema },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const data = (await res.json().catch(() => null)) as ChatResponse | null;
    const ms = Date.now() - started;

    if (!res.ok) {
      // Their message distinguishes a bad key from a withdrawn model from a
      // spent balance, and those need three different fixes.
      await record(req, {
        ok: false,
        ms,
        error: data?.error?.message ?? `Kimi refused the call (HTTP ${res.status}).`,
      });
      return null;
    }

    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      await record(req, { ok: false, ms, error: "Kimi returned an empty answer." });
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      await record(req, { ok: false, ms, error: "Kimi returned something that is not JSON." });
      return null;
    }

    // Schema-constrained output is a request, not a guarantee. Checked again on
    // arrival, because the alternative is a malformed object reaching a screen
    // that shows somebody money.
    if (!matchesSchema(parsed, req.schema)) {
      await record(req, { ok: false, ms, error: "Kimi's answer did not match the requested shape." });
      return null;
    }

    await record(req, { ok: true, ms, tokens: data?.usage?.total_tokens });
    return parsed as T;
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    await record(req, {
      ok: false,
      ms: Date.now() - started,
      // A timeout is by far the most common failure and reads as nonsense
      // otherwise ("The operation was aborted").
      error: /abort|timeout/i.test(message) ? `No answer within ${TIMEOUT_MS / 1000}s.` : message,
    });
    return null;
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
  outcome: { ok: boolean; ms: number; tokens?: number; error?: string }
): Promise<void> {
  try {
    await prisma.aiCall.create({
      data: {
        purpose: req.purpose,
        model: kimiModel(),
        ok: outcome.ok,
        ms: outcome.ms,
        tokens: outcome.tokens ?? null,
        error: outcome.error?.slice(0, 500) ?? null,
        entityType: req.entityType ?? null,
        entityId: req.entityId ?? null,
      },
    });
  } catch {
    // A lost log line must never take down the request it was describing —
    // the same rule the email log has followed since it was written.
  }
}
