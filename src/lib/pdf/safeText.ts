/**
 * Makes text safe to draw with the PDF base fonts.
 *
 * ## The problem, found by rendering rather than reading
 *
 * Our PDFs are drawn with `Helvetica` — a PDF standard-14 base font, which is
 * locked to **WinAnsiEncoding**: 224 characters, essentially Western European
 * Latin. Anything outside that does not throw, does not warn, and does not fall
 * back to a placeholder. It is written as whatever byte the encoder lands on.
 *
 * Rendered and read back out of the content stream:
 *
 * ```
 * "Ngonnso' Ɛtaŋ Ɔbi"            ->  "Ngonnso' taK bi"
 * "Leave at the gate 🙏 thanks"  ->  "Leave at the gate =O thanks"
 * ```
 *
 * `Ɛ` and `Ɔ` vanished. **`ŋ` came out as `K`.** That last one is the reason
 * this module exists rather than a documentation note: a missing letter looks
 * like a bug, but a *wrong* letter looks like a different name. A receipt is a
 * document a customer keeps and may show to somebody, and it was printing their
 * name as something else.
 *
 * This matters here specifically. `Ɛ`, `Ɔ` and `ŋ` are letters of the General
 * Alphabet of Cameroon Languages and appear in real names and place names. And
 * an emoji in a delivery note — "leave it at the gate 🙏" — is an ordinary
 * thing for a customer to type, not an edge case.
 *
 * ## What this does, and what it deliberately does not
 *
 * It guarantees one property: **nothing leaves here that WinAnsi cannot carry**,
 * so no character is ever silently replaced by a different one. Within that:
 *
 * 1. Characters WinAnsi already has (including `é`, `ç`, `—`, `’`, `×`) are
 *    untouched. Most text changes not at all.
 * 2. Letters with an obvious Latin base are folded to it — `Ɛ`→`E`, `ŋ`→`ng`,
 *    `ā`→`a`. `Ngonnso' Etang Obi` is not the name as written, but it is
 *    recognisably the person; `Ngonnso' taK bi` is not.
 * 3. Anything with no Latin reading — emoji, other scripts — is dropped, and
 *    the surrounding spaces are tidied so the line does not gain a gap.
 *
 * **This is a floor, not the finish.** The real fix is to stop using a 1980s
 * character set for documents: embed a Unicode TrueType font and draw the name
 * as written. That is a deliberate typography change across every document this
 * product issues, so it is proposed rather than slipped in alongside a
 * correctness fix — see the pull request. Until then this guarantees the weaker
 * but essential property that what prints is never a different letter.
 *
 * Pure, and proved against a really rendered PDF by
 * `scripts/verify-money-render.mts`.
 */

/**
 * Exactly what WinAnsiEncoding can carry, derived rather than typed out.
 *
 * WinAnsiEncoding is byte-for-byte windows-1252, so the authority is the
 * decoder rather than a table I would transcribe with a mistake in it.
 */
const WIN_ANSI: ReadonlySet<string> = (() => {
  const decoder = new TextDecoder("windows-1252");
  const set = new Set<string>();
  for (let byte = 0x20; byte <= 0xff; byte++) {
    set.add(decoder.decode(Uint8Array.from([byte])));
  }
  // Drawn by the renderer, never by the font.
  set.add("\n");
  set.add("\t");
  return set;
})();

/**
 * Letters with a Latin reading that Unicode's own decomposition does not give.
 *
 * `ŋ` is not "n with a mark on it" as far as NFD is concerned — it is its own
 * letter — so stripping combining marks leaves it untouched and it goes on to
 * be drawn as `K`. These are the ones that actually turn up in Cameroonian
 * orthographies and in names entered on this site.
 */
const FOLD: Readonly<Record<string, string>> = {
  "Ɛ": "E", "ɛ": "e",
  "Ɔ": "O", "ɔ": "o",
  "Ŋ": "Ng", "ŋ": "ng",
  "Ɗ": "D", "ɗ": "d",
  "Ɓ": "B", "ɓ": "b",
  "Ƴ": "Y", "ƴ": "y",
  "Ə": "E", "ə": "e",
  "Ʉ": "U", "ʉ": "u",
  "Ɨ": "I", "ɨ": "i",
  "Ʃ": "Sh", "ʃ": "sh",
  "Ʒ": "Zh", "ʒ": "zh",
  "Ŧ": "T", "ŧ": "t",
  "Đ": "D", "đ": "d",
  "Ħ": "H", "ħ": "h",
  "Ł": "L", "ł": "l",
  "Œ": "OE", "œ": "oe", // in WinAnsi, but spelled out is safer in a name
  "ẞ": "SS",
  "'": "'", // U+02BC modifier apostrophe — common in Ngonnso'
  "ʼ": "'",
  "–": "-", // already WinAnsi, normalised for consistency
  "…": "...",
  " ": " ", // our own money separator: keep it, WinAnsi has it
};

/**
 * Rewrites one character as something WinAnsi can draw, or nothing.
 *
 * Order matters: the explicit fold wins over decomposition, because for `ŋ`
 * decomposition returns the character unchanged and would let it through.
 */
function foldChar(ch: string): string {
  if (WIN_ANSI.has(ch)) return ch;

  const explicit = FOLD[ch];
  if (explicit !== undefined) return explicit;

  // é, ā, ő and friends: take the base letter and drop the marks. Note this is
  // only reached for characters WinAnsi lacks — `é` never gets here.
  const stripped = ch
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (stripped !== ch && stripped.length > 0 && [...stripped].every((c) => WIN_ANSI.has(c))) {
    return stripped;
  }

  // Emoji, other scripts, control characters: there is no honest Latin reading,
  // and inventing one is what produced `K` for `ŋ`.
  return "";
}

/**
 * Returns text that the PDF base fonts can draw without substituting anything.
 *
 * Safe on null and undefined because half the fields on an order are optional
 * and a receipt must render regardless.
 */
export function pdfSafe(text: string | null | undefined): string {
  if (text == null) return "";

  let out = "";
  // Iterating the string directly walks by code point, so an emoji is handled
  // as one character rather than as two lone surrogates.
  for (const ch of text) out += foldChar(ch);

  // Dropping a character can leave a double space or a space before a comma.
  // Tidying is not cosmetic: "Leave at the gate  thanks" reads as a mistake.
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/** True when `pdfSafe` would have to change this text. Used by the proofs. */
export function needsFolding(text: string): boolean {
  return [...text].some((ch) => !WIN_ANSI.has(ch));
}
