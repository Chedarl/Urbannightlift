import "server-only";

import { kimiJson, kimiConfigured } from "@/lib/ai/kimi";
import { imageDataUrl } from "@/lib/ai/images";

/**
 * The *pharmacie de garde* roster, read off a photograph of the poster.
 *
 * This is the highest-yield capture available to this product, and the camera
 * is not a workaround here — it is the only route. I checked:
 * `ordrepharmacien.cm` does not resolve, and the Yaoundé page on
 * `annuaire-medical.cm` is an empty template with no pharmacies in it at all.
 * The roster exists as posters on pharmacy doors, PDFs, newspaper pages and
 * Facebook posts, and nothing else.
 *
 * One photograph produces two things at once:
 *
 *  - **a week of `PharmacyDuty` rows**, which is the only answer to the
 *    question a customer actually has at 2 AM; and
 *  - **a list of real pharmacies with their quartiers**, which is catalogue we
 *    do not otherwise have.
 *
 * The duty rotation is published weekly by the Conseil National de l'Ordre des
 * Pharmaciens, so a pharmacy on it is both real and legally obliged to be open
 * — a far better signal than anything a map database ever gave us.
 *
 * **Nothing here writes anything.** It returns rows to tick.
 */

export interface DutyDraft {
  pharmacyName: string;
  neighbourhood: string | null;
  phone: string | null;
  /** ISO dates. Both required — a shift with no window cannot be stored. */
  startsOn: string;
  endsOn: string;
}

export interface DutyShift {
  pharmacyName?: string;
  neighbourhood?: string | null;
  phone?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
}

interface Answer {
  readable?: boolean;
  shifts?: DutyShift[];
}

const SCHEMA = {
  type: "object",
  required: ["shifts"],
  properties: {
    readable: { type: "boolean" },
    shifts: {
      type: "array",
      items: {
        type: "object",
        required: ["pharmacyName"],
        properties: {
          pharmacyName: { type: "string" },
          neighbourhood: { type: "string" },
          phone: { type: "string" },
          startsOn: { type: "string" },
          endsOn: { type: "string" },
        },
      },
    },
  },
} as const;

function system(todayIso: string): string {
  return `You read pharmacie de garde rosters from Yaoundé, Cameroon, and turn
them into rows. Today is ${todayIso}.

These are published weekly by the Conseil National de l'Ordre des Pharmaciens
and are usually laid out as a table: the pharmacy, its quartier, sometimes a
phone number, and the dates it is on duty — written like "du 03 au 09 août
2026", "SEMAINE DU 3 AU 9 AOÛT", or a column per day.

Rules:
- Return one row per pharmacy per duty period.
- startsOn and endsOn as YYYY-MM-DD. If the poster gives no year, use the year
  that makes the dates fall closest to today. If a single day is given, use it
  for both.
- Drop any row you cannot give both dates for. A shift with no window cannot be
  used, and a guessed date would put a customer outside a closed pharmacy at
  2 AM — the exact situation this roster exists to prevent.
- pharmacyName exactly as printed, keeping the word "Pharmacie" if it is there.
- neighbourhood is the quartier — Bastos, Biyem-Assi, Mvog-Mbi, Nlongkak, Essos,
  Mvan, Ekounou, Nsam, Emana, Mendong, Odza, Ngousso, Tsinga, Mokolo, Etoudi.
- Phone numbers are nine digits, usually 6XX XX XX XX. Digits only.
- Skip headers, footers, page numbers and anything that is not a pharmacy.
- If the photograph is too blurred to read names and dates reliably, set
  readable to false and return an empty list rather than guessing.`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The rows we are willing to keep.
 *
 * A half-read duty row is **worse than a missing one**: it looks authoritative,
 * and it sends somebody across Yaoundé at 2 AM to a pharmacy with the shutters
 * down. So anything without a name and a complete, forward-running date window
 * is dropped here rather than surfaced for an admin to patch up — there is
 * nothing to patch it up *from* except the photograph they already have.
 *
 * Exported so `scripts/verify-duty-poster.ts` can hold it to that.
 */
export function shapeDutyRows(shifts: DutyShift[]): DutyDraft[] {
  const seen = new Set<string>();
  const rows: DutyDraft[] = [];

  for (const raw of shifts) {
    const pharmacyName = raw?.pharmacyName?.trim();
    if (!pharmacyName || pharmacyName.length < 4) continue;

    const startsOn = raw.startsOn?.trim() ?? "";
    const endsOn = raw.endsOn?.trim() ?? "";
    if (!ISO_DATE.test(startsOn) || !ISO_DATE.test(endsOn)) continue;
    // A window that runs backwards is a misread, not a rotation.
    if (endsOn < startsOn) continue;

    const key = `${pharmacyName.toLowerCase()}|${startsOn}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const digits = (raw.phone ?? "").replace(/\D/g, "");
    rows.push({
      pharmacyName: pharmacyName.slice(0, 80),
      neighbourhood: raw.neighbourhood?.trim()?.slice(0, 60) || null,
      phone: digits.length >= 9 ? digits.slice(0, 15) : null,
      startsOn,
      endsOn,
    });

    if (rows.length >= 60) break;
  }

  return rows;
}

/** Reads one roster photograph, or returns null. */
export async function readDutyPoster(photoPath: string | null): Promise<DutyDraft[] | null> {
  if (!kimiConfigured() || !photoPath) return null;

  const url = await imageDataUrl(photoPath);
  if (!url) return null;

  const answer = await kimiJson<Answer>({
    purpose: "pharmacy.duty_poster",
    system: system(new Date().toISOString().slice(0, 10)),
    user: "Read this pharmacie de garde roster and return every shift on it.",
    images: [url],
    schema: SCHEMA as unknown as Record<string, unknown>,
  });
  if (!answer || answer.readable === false) return null;

  return shapeDutyRows(answer.shifts ?? []);
}
