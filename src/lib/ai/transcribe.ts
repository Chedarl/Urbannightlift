import "server-only";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { redactSecrets } from "@/lib/redact";
import { got, none, type AiRead } from "@/lib/ai/result";

/**
 * Turning a voice note into words.
 *
 * ## Why this is worth doing at all
 *
 * A voice note is how people actually communicate here. Somebody standing in
 * the street at 11 PM will record ten seconds rather than fill in twenty
 * fields, and that is the least-friction way into this product by a wide
 * margin. It has worked since v13 — the recording is stored and a dispatcher
 * plays it.
 *
 * Playing it is the problem. A dispatcher with four orders open has to find
 * somewhere quiet, listen at whatever pace the customer spoke, and hold the
 * address in their head while typing it. Audio is also completely unsearchable:
 * "which order mentioned Biyem-Assi" has no answer.
 *
 * Words fix all of that, and cost about a tenth of a second of somebody's
 * attention instead of forty seconds.
 *
 * ## Why Groq rather than Kimi
 *
 * **Kimi cannot hear.** Moonshot has vision and no audio model at all, which is
 * why this is the one feature in the product that reaches a second provider.
 * Groq hosts Whisper, has a genuinely free tier that needs no card — which
 * matters, because a card is precisely what this business could not get for
 * Google Maps — and speaks the same OpenAI-shaped protocol as everything else
 * here.
 *
 * Whisper handles French, English and the mixture of the two people actually
 * speak in Yaoundé, which no keyword approach would.
 *
 * ## The rules, which are the same as every other model call in this codebase
 *
 *  - **Never on the critical path.** This runs after the order exists. A
 *    failure leaves the order exactly as it is today, with a recording and no
 *    transcript, and a person listens. Nothing is blocked, ever.
 *  - **The recording is never deleted.** A transcript is a second opinion on
 *    the audio, not a replacement for it. If the words are wrong, the truth is
 *    still one tap away — and a customer's actual voice is the record of what
 *    they asked for.
 *  - **Logged like everything else**, so `/admin/settings` shows what it cost
 *    and what it has been failing at, in the provider's own words.
 *
 * ## And the honest part
 *
 * **This sends a customer's voice to a company outside Cameroon.** The privacy
 * page used to say voice notes were "private to our team", and that stopped
 * being true the moment this shipped — so the page changed in the same commit.
 * Not a footnote, and not something to do later.
 */

/** Groq's OpenAI-compatible audio endpoint. */
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

/**
 * Whisper large v3 turbo: the fastest of the family and easily accurate enough
 * for "two pizzas to Biyem-Assi, behind the Total station". Pinned rather than
 * floating, for the reason the Kimi model is pinned — a model that changes
 * under a running business is a bug nobody can reproduce.
 */
const MODEL = "whisper-large-v3-turbo";

/** A voice note is seconds long. Anything slower than this is a failure. */
const TIMEOUT_MS = 30_000;

/** Whisper's own ceiling on the free tier, and far above any real note. */
const MAX_BYTES = 25 * 1024 * 1024;

export function groqKey(): string | null {
  const key = (process.env.GROQ_API_KEY ?? "").trim();
  return key.length > 0 ? key : null;
}

/** Whether transcription is switched on at all. */
export function transcriptionConfigured(): boolean {
  return groqKey() !== null;
}

/**
 * Reads a stored voice note into words.
 *
 * Takes the `bucket/key` path the order already carries. Only ever
 * `order-voice-notes` — a path pointing anywhere else is refused rather than
 * fetched, so this can never be pointed at a prescription or an identity
 * document by a caller that gets a variable wrong.
 */
export async function transcribeVoiceNote(path: string | null | undefined): Promise<AiRead<string>> {
  const key = groqKey();
  if (!key) return none("No Groq key is configured, so voice notes are not transcribed.");

  const stored = (path ?? "").trim();
  const slash = stored.indexOf("/");
  if (slash < 1) return none("There is no voice note on this order.");
  const bucket = stored.slice(0, slash);
  const objectKey = stored.slice(slash + 1);

  // The allow-list is a single bucket on purpose. Everything else in private
  // storage is a prescription, an identity document, a payment proof or a
  // delivery photo, and none of those is ever sent to a transcription service.
  if (bucket !== "order-voice-notes" || !objectKey) {
    return none("That is not a voice note.");
  }

  const started = Date.now();

  /**
   * Records the real outcome, once.
   *
   * Written as a helper rather than a `finally` block because a `finally` here
   * cannot see whether the call succeeded, and a version of this that always
   * logged a failure would have quietly made every number on the AI panel
   * wrong — the same double-counting mistake the streaming fallback made.
   */
  async function log(ok: boolean, error?: string): Promise<void> {
    await prisma.aiCall
      .create({
        data: {
          purpose: "voice.transcribe",
          model: MODEL,
          ok,
          ms: Date.now() - started,
          buildRef: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
          error: error ? redactSecrets(error).slice(0, 500) : null,
        },
      })
      .catch(() => {});
  }

  /** Every exit reports itself, so no path can leave the panel guessing. */
  async function fail(reason: string): Promise<AiRead<string>> {
    await log(false, reason);
    return none(reason);
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(bucket).download(objectKey);
    if (error || !data) return fail(error?.message ?? "The recording could not be read.");

    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.length === 0) return fail("The recording is empty.");
    if (bytes.length > MAX_BYTES) return fail("That recording is too long to transcribe.");

    const form = new FormData();
    // The stored name carries the extension Whisper uses to pick a decoder, so
    // it is passed through rather than replaced with something generic.
    form.append("file", new Blob([new Uint8Array(bytes)]), objectKey.split("/").pop() || "note.webm");
    form.append("model", MODEL);
    // Deliberately not pinned to a language. Yaoundé speaks French, English and
    // a mixture inside one sentence; forcing a language would mistranscribe the
    // half that is not it.
    form.append("response_format", "json");
    form.append(
      "prompt",
      // Whisper takes a prompt as a spelling hint, not an instruction. Feeding
      // it the place names it will actually hear stops "Biyem-Assi" coming back
      // as "Bien assis".
      "A delivery order in Yaoundé, Cameroon. Place names include Biyem-Assi, Bastos, Mvan, Nsam, Mendong, Odza, Emana, Nkoldongo, Mokolo, Essos, Ekounou."
    );

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = (await res.json().catch(() => null)) as { text?: string; error?: { message?: string } } | null;
    if (!res.ok) {
      return fail(body?.error?.message ?? `Groq refused the call (HTTP ${res.status}).`);
    }

    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return fail("Nothing could be made out in that recording.");

    await log(true);
    return got(text.slice(0, 2000));
  } catch (err) {
    return fail(
      (err as Error)?.name === "TimeoutError"
        ? "Transcription took too long."
        : ((err as Error)?.message ?? "Transcription failed.")
    );
  }
}
