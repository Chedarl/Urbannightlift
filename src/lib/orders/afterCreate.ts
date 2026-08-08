import "server-only";

import { prisma } from "@/lib/prisma";
import { transcribeVoiceNote, transcriptionConfigured } from "@/lib/ai/transcribe";
import { screenOrderText } from "@/lib/ai/moderation";

/**
 * The two model calls that happen *after* an order exists.
 *
 * ## Why after, and why together
 *
 * Both of these are opinions, not decisions. A transcript helps a dispatcher
 * read a voice note; a safety flag helps them notice something before a rider
 * is sent. Neither is allowed anywhere near whether the order is created,
 * because the rule that has held across this whole codebase is that **an order
 * must never fail because a model did**.
 *
 * Putting them in one place rather than two makes that rule checkable: there is
 * a single function, it is called once, it is awaited by nobody, and everything
 * inside it is wrapped. If a future feature wants a third opinion on a new
 * order, it goes here and inherits the same guarantees.
 *
 * ## Fire and forget, deliberately
 *
 * The caller does `void afterOrderCreated(...)` and returns to the customer
 * immediately. Transcription takes a few seconds and the safety screen takes a
 * few more; making somebody watch a spinner for that after they have already
 * pressed the button would be trading the customer's time for the dispatcher's.
 *
 * The consequence is honest and worth stating: for a few seconds after an order
 * lands, the console shows it without a transcript or a flag. That is the right
 * trade — dispatch is not looking at a brand-new order in its first three
 * seconds, and the customer very much is.
 */
export async function afterOrderCreated(opts: {
  orderId: string;
  voiceNoteUrl: string | null;
  /** Only what the customer typed. Never their name, number or address. */
  freeText: string;
}): Promise<void> {
  await Promise.allSettled([
    maybeTranscribe(opts.orderId, opts.voiceNoteUrl),
    maybeScreen(opts.orderId, opts.freeText),
  ]);
}

/**
 * Words for the recording, if there is one and a key to read it with.
 *
 * A failure writes nothing at all rather than an apology into the transcript
 * field: a dispatcher seeing "could not transcribe" where the words should be
 * would reasonably stop looking for the play button, which is the one thing
 * that always works.
 */
async function maybeTranscribe(orderId: string, voiceNoteUrl: string | null): Promise<void> {
  if (!voiceNoteUrl || !transcriptionConfigured()) return;

  const read = await transcribeVoiceNote(voiceNoteUrl);
  if (!read.data) return;

  await prisma.order
    .update({
      where: { id: orderId },
      data: { voiceTranscript: read.data, voiceTranscribedAt: new Date() },
    })
    .catch(() => {});
}

/**
 * A glance at the free text, and a flag if something is worth a person's time.
 *
 * Silence is the overwhelmingly common outcome and stays silent — nothing is
 * written, and the order looks exactly as it does today.
 */
async function maybeScreen(orderId: string, freeText: string): Promise<void> {
  const read = await screenOrderText(freeText);
  // `data` is null both when there is no concern and when the call failed. Both
  // mean the same thing here: do not put a mark on this order.
  if (!read.data) return;

  await prisma.order
    .update({
      where: { id: orderId },
      data: {
        safetyFlag: `${read.data.category}: ${read.data.reason}`,
        safetyFlaggedAt: new Date(),
      },
    })
    .catch(() => {});
}
