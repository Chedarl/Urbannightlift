/**
 * What every AI read hands back: the answer, or why there isn't one.
 *
 * The same defect has now appeared three times in this codebase, and it is
 * always this shape — a function returns a bare `null`, the reason goes into a
 * log, and the screen in front of the person says *"couldn't read that photo"*.
 * Twice that generic sentence hid a real, fixable cause: a remote URL the
 * provider does not accept, and an image that was not an image. Both times
 * somebody went off to retake a photograph that had been fine all along.
 *
 * A `null` is the right answer for a caller that only needs to fall back. It is
 * the wrong answer for a caller with somewhere to put a sentence. So both
 * travel together, and each caller takes what it can use.
 *
 * The rule that does not change: **an AI failure is never an exception.** Every
 * one of these resolves; nothing here throws, and nothing in this product fails
 * because a model did.
 */
export interface AiRead<T> {
  /** The answer, or null. Callers that only need to fall back read this alone. */
  data: T | null;
  /**
   * Why there is no answer, in the provider's own words where there are any.
   * Null when `data` is present. Safe to show a member of staff — it goes
   * through `redactSecrets` before it is ever stored or returned.
   */
  error: string | null;
}

/** An answer. */
export function got<T>(data: T): AiRead<T> {
  return { data, error: null };
}

/** No answer, and the reason why. */
export function none<T>(error: string): AiRead<T> {
  return { data: null, error };
}
