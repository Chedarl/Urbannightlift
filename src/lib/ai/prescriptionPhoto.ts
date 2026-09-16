import "server-only";

import { kimiJsonResult, kimiConfigured } from "@/lib/ai/kimi";
import { readImage } from "@/lib/ai/images";
import { got, none, type AiRead } from "@/lib/ai/result";

/**
 * Reading a photographed prescription into rows somebody can check.
 *
 * ## What this is for
 *
 * The medicine list on the pharmacy page is a row of text boxes, and the person
 * filling it in at 2 AM is holding a doctor's note and a sick child. v53 gave
 * them the twenty things a night pharmacy is usually asked for; this is for the
 * order that is not one of those — a real prescription, in a doctor's
 * handwriting, that they are currently expected to transcribe.
 *
 * It is modelled on `menuPhoto.ts` and uses the same reader, the same image
 * sniffing and the same result type, because it is the same problem: a
 * photograph of something written down, turned into rows.
 *
 * ## Three rules, and the first one is why this file is careful
 *
 * **It never invents a prescription.** The version this was adapted from
 * catches a provider failure and substitutes a named doctor and two specific
 * drugs. On a delivery app that is a fabricated prescription attached to a real
 * order, dialled by a dispatcher and carried to a pharmacy counter. Here every
 * failure — no key, unreadable photo, timeout, provider error — returns `none`
 * with a reason, and the list the customer already had is left exactly as it
 * was. The photograph still reaches the pharmacist, which is what happens today
 * and has always been the actual safeguard.
 *
 * **A reading is a suggestion, never a submission.** Nothing here writes an
 * order. It returns rows for the customer to correct, and the screen requires
 * them to say they have checked the names and doses before any of it is used.
 * This is a machine reading handwriting; it will get some of them wrong.
 *
 * **The words inherit the file's privacy.** A prescription is already private
 * and never appears in the shared order PDF. The text read out of it is the
 * same document in another form and is held to the same rule.
 *
 * ## What it does not try to do
 *
 * No dose checking, no interaction warnings, no substitution advice. The
 * pharmacist does that, and a delivery company producing clinical opinions
 * would be both wrong and unlawful. This transcribes.
 */

export interface DraftMedicine {
  /** The drug as written. */
  name: string;
  /** Strength, when the note gives one — "500 mg", "1 g / 125 mg". */
  strength: string | null;
  /** Tablets, syrup, injectable… what the pharmacist hands over. */
  form: string | null;
  /** How much of it — "2 boîtes", "1 flacon". */
  quantity: string | null;
  /** How to take it, copied across for the pharmacist, never interpreted. */
  dosage: string | null;
}

interface Answer {
  readable?: boolean;
  items?: {
    name?: string;
    strength?: string;
    form?: string;
    quantity?: string;
    dosage?: string;
  }[];
}

const SCHEMA = {
  type: "object",
  properties: {
    readable: { type: "boolean" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          strength: { type: "string" },
          form: { type: "string" },
          quantity: { type: "string" },
          dosage: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  required: ["readable", "items"],
};

const SYSTEM = `You transcribe medical prescriptions photographed in Cameroon. You
are a transcriber, not a clinician.

- Copy only what is written. Never add a medicine, a strength, a quantity or a
  dose that is not on the page, and never correct one you think is wrong.
- Leave a field null rather than guessing it. A missing strength is a fact the
  pharmacist needs; an invented one is dangerous.
- Prescriptions here are usually in French and often handwritten. Brand names
  common in Cameroon include Coartem, Maloxine, Doliprane, Efferalgan, Smecta,
  Spasfon, Bétadine.
- Do not transcribe the patient's name, the doctor's name, the clinic, or any
  address. Only the medicines.
- If the photograph is too blurred, dark or cropped to read the drug names with
  confidence, set readable to false and return an empty items list. A partial
  reading of a prescription is worse than none.`;

/**
 * Reads one photographed prescription, or returns null with a reason.
 *
 * Null covers no key, an unreadable photo, a timeout and a provider error
 * identically, because the customer does the same thing in all four: takes a
 * clearer photo, or types the names themselves. In every one of those cases the
 * file they uploaded still goes to the pharmacist.
 */
export async function readPrescriptionPhoto(
  photoPath: string | null,
  orderRef?: string
): Promise<AiRead<DraftMedicine[]>> {
  if (!kimiConfigured()) return none("No reader is configured.");

  // Sniffed from the bytes, so a mislabelled upload says what it actually is
  // rather than becoming an unhelpful provider rejection.
  const image = await readImage(photoPath);
  if (!image.dataUrl) return none(image.problem ?? "Couldn't read that file.");

  const result = await kimiJsonResult<Answer>({
    purpose: "prescription.read",
    system: SYSTEM,
    user: "Transcribe the medicines on this prescription. Copy what is written and nothing else.",
    images: [image.dataUrl],
    schema: SCHEMA as unknown as Record<string, unknown>,
    entityType: "order",
    entityId: orderRef,
  });

  const answer = result.answer;
  if (!answer) return none(result.error ?? "No answer came back.");

  if (answer.readable === false) {
    // The model saying it cannot make the page out is a good answer, not a
    // failure, and the person holding the phone needs to hear something
    // different from a provider error.
    return none("Couldn't read that clearly. Try again with more light, or type the names yourself.");
  }

  const seen = new Set<string>();
  const items: DraftMedicine[] = [];

  for (const raw of answer.items ?? []) {
    const name = raw?.name?.trim();
    // Two characters is not a drug name, and a bare number is a dose that lost
    // its label. Both are the shapes that turn a transcription into noise.
    if (!name || name.length < 3 || /^\d+$/.test(name)) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      name: name.slice(0, 120),
      strength: clip(raw.strength, 48),
      form: clip(raw.form, 48),
      quantity: clip(raw.quantity, 48),
      dosage: clip(raw.dosage, 160),
    });

    // A prescription with more than a dozen lines is a photograph of something
    // else, and the rest of them are not worth a customer scrolling past.
    if (items.length >= 12) break;
  }

  if (items.length === 0) {
    return none("Nothing that looked like a medicine was found on that photo.");
  }

  return got(items);
}

/** Trimmed, capped, and null rather than empty — an empty string is not a fact. */
function clip(v: string | undefined, max: number): string | null {
  const s = v?.trim();
  return s ? s.slice(0, max) : null;
}
