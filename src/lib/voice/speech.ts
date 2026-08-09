"use client";

/**
 * Transcribing on the customer's own phone, with no key and no account.
 *
 * ## Why this exists
 *
 * The server-side transcription built alongside this needs a Groq key, and the
 * owner could not obtain one. That is not a small obstacle to work around
 * politely — it is the same wall that blocked Google Maps for this business, and
 * a feature that depends on a foreign company's signup flow accepting a
 * Cameroonian phone number is a feature that may simply never switch on.
 *
 * So this is the path that cannot be blocked: **the browser already has a
 * speech recogniser.** `SpeechRecognition` ships in Chrome on Android and
 * Safari on iOS, needs no key, no account, no card and no approval, and it runs
 * while the customer is already speaking into the microphone we already opened.
 *
 * ## The one real trade, stated plainly
 *
 * This is **not on-device on every browser.** Chrome streams the audio to
 * Google's speech service; Safari may use Apple's. So a customer's voice still
 * reaches a company outside Cameroon, exactly as the Groq path would have — the
 * privacy page's wording covers both and did not need to change again.
 *
 * What it does avoid is us holding an account, a key, and a bill.
 *
 * ## Why at record time rather than afterwards
 *
 * `SpeechRecognition` listens to a live microphone. It cannot be handed a
 * stored file. That sounds like a limitation and is mostly a gift: the words
 * are ready the moment the customer stops speaking, so the transcript travels
 * with the order instead of arriving seconds later, and there is no second
 * round trip to fail.
 *
 * ## What it is not
 *
 * Not a replacement for the recording, and not a replacement for the Groq path.
 * The audio is still uploaded and still playable, and if a key is ever
 * configured the server still fills in a transcript for anything this could not
 * catch — an unsupported browser, a denied permission, a silent failure.
 * Two independent routes to the same field, and neither is required.
 */

/**
 * The vendor-prefixed constructor, if this browser has one.
 *
 * Typed locally rather than pulled from a DOM lib because the standard
 * `SpeechRecognition` types are not in TypeScript's default DOM definitions and
 * adding a dependency for four properties would be the wrong trade.
 */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

interface SpeechResultEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: { isFinal: boolean; 0: { transcript: string } };
  };
}

type Ctor = new () => SpeechRecognitionLike;

function constructor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether this browser can do it at all. Checked before anything is promised. */
export function speechSupported(): boolean {
  return constructor() !== null;
}

export interface Listener {
  /** Everything heard so far, final segments only. */
  text(): string;
  stop(): void;
}

/**
 * Starts listening alongside the recorder, and returns what it heard.
 *
 * **Never throws and never rejects.** A browser without support, a denied
 * permission, or a recogniser that dies halfway all end the same way: an empty
 * transcript, and an order that behaves exactly as it does today. Transcription
 * is a convenience laid on top of a recording that already works — it must
 * never be able to cost somebody their voice note.
 *
 * @param fr Which language to listen for. Cameroon is bilingual and the
 *   recogniser wants one, so this follows the language the customer is already
 *   using the app in — the best available guess, and wrong at worst for
 *   somebody who switches mid-sentence.
 */
export function listenWhileRecording(fr: boolean): Listener {
  const Ctor = constructor();
  if (!Ctor) return { text: () => "", stop: () => {} };

  let heard = "";
  let live: SpeechRecognitionLike | null = null;

  try {
    const recognition = new Ctor();
    recognition.lang = fr ? "fr-FR" : "en-US";
    // A voice note is one continuous thought with pauses in it. Without this
    // the recogniser stops at the first silence and loses the second half.
    recognition.continuous = true;
    // Only settled text is kept. Interim results flicker and rewrite
    // themselves, and half of one landing in an order is worse than nothing.
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) heard += `${result[0].transcript} `;
      }
    };
    // Both are deliberately silent. The customer is in the middle of recording
    // and there is nothing they could usefully do about a recogniser fault —
    // the recording itself is unaffected and a person can still listen to it.
    recognition.onerror = () => {};
    recognition.onend = () => {};

    recognition.start();
    live = recognition;
  } catch {
    // Some browsers throw on `start()` when the microphone is already claimed.
    // Nothing to do but carry on without words.
    live = null;
  }

  return {
    text: () => heard.trim().slice(0, 2000),
    stop: () => {
      try {
        live?.stop();
      } catch {
        /* already stopped, or never started */
      }
    },
  };
}
