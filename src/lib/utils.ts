import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalize a phone number to digits-only international form (no leading +). */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/[^\d]/g, "");
  // Local Cameroon format (6XXXXXXXX) -> prefix country code
  if (digits.length === 9 && digits.startsWith("6")) digits = `237${digits}`;
  return digits;
}

/**
 * The thousands separator, chosen rather than inherited.
 *
 * ## Why this is not `toLocaleString("fr-FR")`
 *
 * Because that was printing **`125/000 XAF` on every receipt.**
 *
 * Modern ICU groups French numbers with U+202F NARROW NO-BREAK SPACE. On a web
 * page that is correct and invisible. Our PDFs are drawn with `Helvetica` — a
 * PDF standard-14 base font, which is restricted to WinAnsiEncoding, and
 * U+202F is not in WinAnsi. It does not fall back to a space or drop out. It
 * comes out as byte `0x2F`, which in that encoding is the **slash**. Verified
 * by rendering one and reading the text operator:
 *
 * ```
 * toLocaleString("fr-FR")   31 32 35 2F 30 30 30   ->  "125/000"
 * ordinary space            31 32 35 20 30 30 30   ->  "125 000"
 * U+00A0 no-break space     31 32 35 A0 30 30 30   ->  "125 000"
 * ```
 *
 * Every order summary and every receipt — financial documents a customer keeps
 * and may show to somebody — has been printing money with a slash through it.
 * Nothing failed: no exception, no warning, correct arithmetic, and the same
 * string renders perfectly in the browser two feet away.
 *
 * U+00A0 is both typographically right for French *and* inside WinAnsi, so it
 * survives every surface we render to. Picking it explicitly is the whole point:
 * the bug was letting a library decide a byte that has to cross into a format
 * with a 1980s character set.
 */
const GROUP_SEPARATOR = "\u00A0";

/**
 * Groups an integer in threes. No locale lookup, deliberately.
 *
 * `toLocaleString` is not merely overkill here — it is the hazard, because what
 * it returns depends on the ICU build of whatever runtime happens to execute
 * it. This is the one piece of money formatting in the product and it should
 * produce the same bytes on a phone, in a Vercel function and in a PDF.
 */
export function groupXaf(amount: number): string {
  const negative = amount < 0;
  const digits = Math.abs(Math.round(amount)).toString();

  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += GROUP_SEPARATOR;
    out += digits[i];
  }
  return negative ? `-${out}` : out;
}

export function formatXaf(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `${groupXaf(amount)} XAF`;
}
