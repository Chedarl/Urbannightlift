import { isNightHour } from "@/lib/pharmacy/tonight";

/**
 * Reading "Open · Closes 10:00 PM" and deciding whether that is a night
 * business.
 *
 * ## Why this module exists
 *
 * The owner supplied the first real catalogue — nineteen pharmacies and about
 * sixty food businesses, each carrying its trading hours. The pipeline that
 * imports them threw the hours away and recorded **every** row as open every
 * night: `intakeMerchant` defaulted `nightOpen` to `true` and the import route
 * never passed it. At 1 a.m. that would have shown roughly forty-eight
 * restaurants as open which had shut hours earlier, and sent riders to locked
 * doors — the v12 failure again, except the false claim would have been ours,
 * made against data that contained the right answer.
 *
 * ## Why an hour, not just a boolean
 *
 * `nightOpen` is one bit and it cannot express "open until midnight", which is
 * what a large share of this list actually is. Kept as a bit, a place closing
 * at 00:00 either vanishes from the 10 p.m. screen where it is genuinely open,
 * or claims the 2 a.m. screen where it is genuinely shut. Both are wrong, and
 * choosing between them is not engineering.
 *
 * So the close hour is parsed and stored, and `openAtHour` answers the real
 * question. `nightOpen` stays for the rows that predate this and for the
 * coarse "is this a night business at all" sort.
 *
 * ## The rule that matters more than any parse
 *
 * **Unreadable hours never mean open.** `known: false` returns the flags off.
 * A business we cannot vouch for is a business the customer does not see at
 * 2 a.m., and that is the correct direction for the mistake to fall.
 */

export interface ReadHours {
  /** Trades at some point between 22:00 and 04:00. The coarse flag. */
  nightOpen: boolean;
  open24h: boolean;
  /**
   * The hour it stops serving, 0–23, midnight as 0. Null when the text did not
   * say — which is different from saying it closes at midnight.
   */
  closesAtHour: number | null;
  /** The hour it starts. Null when unstated; 06:00 is assumed downstream. */
  opensAtHour: number | null;
  /** False when nothing could be read. Callers must not treat this as open. */
  known: boolean;
}

const NOTHING: ReadHours = {
  nightOpen: false,
  open24h: false,
  closesAtHour: null,
  opensAtHour: null,
  known: false,
};

/** Anything trading to this hour or beyond counts as a night business. */
const LATE_ENOUGH = 23;
/** A close hour at or below this is understood as after midnight. */
const AFTER_MIDNIGHT = 6;
/** Assumed opening when the text gives a close but no open. */
export const ASSUMED_OPENS_AT = 6;

/**
 * 12-hour clock to a 0–23 hour, rounding minutes up.
 *
 * Rounding up is deliberate: "Closes 10:30 PM" is open *during* hour 22, so the
 * hour it stops serving is 23. The one that matters most is "11:59 PM", which
 * rounds to 24 and normalises to midnight — the same answer as "12:00 AM",
 * which is what the board means by it.
 */
function hour24(h: number, minutes: number, meridiem: string): number {
  let base = h % 12;
  if (/p/i.test(meridiem)) base += 12;
  if (minutes > 0) base += 1;
  return base % 24;
}

/**
 * Reads a line of opening hours.
 *
 * Written against the shapes the owner's batches actually use — Google's
 * "Open · Closes 10:00 PM", "Closed · Opens 12:00 PM", "Open 24 hours" — plus
 * the prose forms that turn up in the same lists ("open until 6 AM", "24/7").
 */
export function readHours(text: string | null | undefined): ReadHours {
  const raw = (text ?? "").trim();
  if (!raw) return NOTHING;

  // 24 hours beats every other signal in the line: a place described as open
  // 24 hours and also "closes 11:00 PM" is a listing that contradicts itself,
  // and the round-the-clock claim is the one people act on.
  if (/\b24\s*\/?\s*7\b|\b24\s*(?:h|hr|hrs|hours|heures)\b|\bnon[- ]?stop\b/i.test(raw)) {
    return { nightOpen: true, open24h: true, closesAtHour: null, opensAtHour: null, known: true };
  }

  const close = raw.match(/(?:closes?|ferme|jusqu'?[àa]|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m|p\.?m)?/i);
  const open = raw.match(/(?:opens?|ouvre)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m|p\.?m)?/i);

  let closesAtHour: number | null = null;
  if (close) {
    const h = Number(close[1]);
    const m = Number(close[2] ?? 0);
    // No meridiem on a closing time is read as evening — a board saying
    // "closes 11" in this city is not 11 in the morning.
    closesAtHour = hour24(h, m, close[3] ?? "pm");
  }

  let opensAtHour: number | null = null;
  if (open) {
    const h = Number(open[1]);
    const m = Number(open[2] ?? 0);
    // Minutes are not rounded up on an opening time: a place opening 11:30
    // is not open during hour 11, so the hour it starts serving is 12.
    opensAtHour = hour24(h, m, open[3] ?? "am");
  }

  if (closesAtHour == null && opensAtHour == null) {
    // "Open" on its own says the listing was open when it was scraped, which
    // tells us nothing about 2 a.m.
    return NOTHING;
  }

  const nightOpen =
    closesAtHour != null && (closesAtHour <= AFTER_MIDNIGHT || closesAtHour >= LATE_ENOUGH);

  return { nightOpen, open24h: false, closesAtHour, opensAtHour, known: true };
}

/**
 * Is it serving at this hour?
 *
 * The close hour answers this exactly where we have one. Where we do not, it
 * falls back to the coarse boolean and the trading window, which is how every
 * row imported before this module behaves.
 */
export function openAtHour(
  m: {
    nightOpen: boolean;
    open24h: boolean;
    closesAtHour?: number | null;
    opensAtHour?: number | null;
  },
  hour: number,
  windowStart: number,
  windowEnd: number
): boolean {
  if (m.open24h) return true;

  const close = m.closesAtHour;
  if (close == null) return isNightHour(hour, windowStart, windowEnd) && m.nightOpen;

  // Closing after midnight means the shift wraps: open from the opening hour
  // through to the close on the following calendar day.
  if (close <= AFTER_MIDNIGHT) {
    /*
      A wrap-around close with no stated opening cannot borrow the daytime
      assumption. "Open until 6 AM" with an assumed 06:00 start resolves to
      `hour >= 6 || hour < 6` — true at every hour of the day, so a late bar
      silently became a 24-hour one. Caught by the suite.

      What we actually know about such a place is that it trades through the
      night, so the trading window's own start is the honest floor.
    */
    const opens = m.opensAtHour ?? windowStart;
    return hour >= opens || hour < close;
  }

  return hour >= (m.opensAtHour ?? ASSUMED_OPENS_AT) && hour < close;
}
