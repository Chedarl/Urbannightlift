import "server-only";

import { kimiJsonResult, kimiConfigured } from "@/lib/ai/kimi";
import { readImage } from "@/lib/ai/images";

/**
 * Getting a business into the catalogue in fifteen seconds instead of five
 * minutes.
 *
 * The food page and the medicine page are both correct and both empty, because
 * nothing is verified. Everything already built to fill them — the menu-photo
 * reader, `/merchant/join`, the website menu-draft — assumes the merchant is
 * *already in the system*. Getting them in is still typing a name, a phone
 * number, a neighbourhood and a set of hours, per business, by hand. That is
 * the actual bottleneck.
 *
 * ## Why a screenshot, of all things
 *
 * Every automated route has been tried and closed, and the reasons have not
 * changed: Google's terms forbid storing Places content and the account is
 * unreachable anyway; a map import put 959 mostly-defunct businesses in the
 * catalogue and was deleted in v12; Meta has no name-search API and blocks
 * unauthenticated page reads outright.
 *
 * But the owner is already doing the work — sitting with a phone, looking at a
 * business's Instagram or Facebook page, deciding whether it is real. Nothing
 * blocks a screenshot of a screen you are lawfully looking at, and what is read
 * out of it is **factual business contact information**: a name, a phone
 * number, a neighbourhood, opening hours. No photographs are copied, no listing
 * content is republished, and a person confirms every field before it saves.
 *
 * ## Nothing here writes anything
 *
 * It returns a draft. The route that saves it is separate and takes only the
 * rows an admin ticked — the same two-step shape as the menu photo and the
 * website menu-draft, for the same reason: this project has twice paid for a
 * catalogue that was filled without a human looking.
 */

export interface MerchantDraft {
  merchantName: string | null;
  category: "FOOD" | "PHARMACY" | "GROCERY" | "GENERAL_STORE" | "OTHER" | null;
  subcategory: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  neighbourhood: string | null;
  address: string | null;
  openingHours: string | null;
  /** Open during our trading night — the only availability that matters here. */
  nightOpen: boolean | null;
  open24h: boolean | null;
  socialUrl: string | null;
  /** Anything priced that was visible. Fed into the products editor, not saved. */
  products: { name: string; priceXaf: number | null }[];
}

export interface CaptureAnswer {
  readable?: boolean;
  /** What the picture actually is. The field that stops a menu becoming a shop. */
  looksLike?: string;
  merchantName?: string | null;
  category?: string | null;
  subcategory?: string | null;
  phone?: string | null;
  whatsappNumber?: string | null;
  neighbourhood?: string | null;
  address?: string | null;
  openingHours?: string | null;
  nightOpen?: boolean | null;
  open24h?: boolean | null;
  socialUrl?: string | null;
  products?: { name?: string; priceXaf?: number | null }[];
}

const SCHEMA = {
  type: "object",
  properties: {
    readable: { type: "boolean" },
    looksLike: { type: "string" },
    merchantName: { type: "string" },
    category: { type: "string" },
    subcategory: { type: "string" },
    phone: { type: "string" },
    whatsappNumber: { type: "string" },
    neighbourhood: { type: "string" },
    address: { type: "string" },
    openingHours: { type: "string" },
    nightOpen: { type: "boolean" },
    open24h: { type: "boolean" },
    socialUrl: { type: "string" },
    products: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" }, priceXaf: { type: "number" } },
      },
    },
  },
} as const;

const RULES = `You extract business contact details for a delivery service in
Yaoundé, Cameroon. The result is reviewed by a person before anything is saved.

Rules:
- Report ONLY what is actually stated. Leave a field out rather than guessing it.
  A wrong phone number sends a rider to nobody; a blank one is asked for on the
  next call.
- category: FOOD for restaurants, street food, bakeries, cafés and fast food;
  PHARMACY for pharmacies; GROCERY for supermarkets, mini-markets and alimentations;
  GENERAL_STORE for other shops; OTHER when it is genuinely unclear.
- subcategory: the plain word the business uses for itself — braise, snack,
  boulangerie, alimentation, supérette.
- Cameroonian numbers are nine digits and usually written 6XX XX XX XX, sometimes
  with +237. Return digits only, keeping the 237 if it is shown.
- neighbourhood: the quartier — Bastos, Biyem-Assi, Mvog-Mbi, Nlongkak, Essos,
  Mvan, Ekounou, Nsam, Emana, Etoudi, Mendong, Odza, Ngousso, Tsinga, Mokolo.
- openingHours: exactly as written. nightOpen true only if it plainly trades
  after 8pm; open24h only if it says 24h or "24/24". Leave both out if unstated —
  do not infer late opening from a business type.
- prices are in XAF (FCFA). Return plain integers with no separators. Never
  estimate a price that is not written down.`;

const SCREENSHOT_SYSTEM = `${RULES}

You are reading a screenshot of a business's own social media page or website.
Take the name, contact details, location and hours from what is on screen.

FIRST, say what the picture actually is, in looksLike:
- "business_page" — a profile, a shop front page, a website header: something
  that identifies WHO a business is.
- "menu" — a menu, a price board, a list of dishes or products with prices.
- "receipt" — a till receipt or an invoice.
- "other" — anything else.

This matters more than the rest. A menu is not a business, and a menu's heading
is not a business's name. If looksLike is anything but "business_page", return
looksLike and NOTHING else — no merchantName, no phone, no address. Somebody
photographing a menu wants their prices read, and inventing a shop out of it
puts a business in the catalogue that nobody has ever confirmed exists.`;

const THREAD_SYSTEM = `${RULES}

You are reading a WhatsApp or SMS conversation with a business. Take their
details from what they themselves said. Ignore our side of the conversation and
ignore pleasantries. If the conversation contains no business details, set
readable to false.`;

/** Digits only, keeping a 237 prefix if it is there. Never a partial number. */
function phone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  return digits.slice(0, 15);
}

function clean(raw: string | null | undefined, max: number): string | null {
  const value = raw?.trim();
  return value ? value.slice(0, max) : null;
}

const CATEGORIES = new Set(["FOOD", "PHARMACY", "GROCERY", "GENERAL_STORE", "OTHER"]);

/**
 * Everything the model said, reduced to what we are willing to store.
 *
 * Exported so it can be proved rather than trusted — this is the layer that
 * decides a phone number is complete, a category is one we recognise, and an
 * unstated fact stays unstated. `scripts/verify-merchant-capture.ts` runs it
 * against the shapes a real page produces.
 */
export function shapeDraft(answer: CaptureAnswer): MerchantDraft | null {
  // A draft with no name is not a merchant, it is a blank form with extra steps.
  const merchantName = clean(answer.merchantName, 80);
  if (!merchantName) return null;

  const category = (answer.category ?? "").toUpperCase();

  return {
    merchantName,
    category: CATEGORIES.has(category) ? (category as MerchantDraft["category"]) : null,
    subcategory: clean(answer.subcategory, 32),
    phone: phone(answer.phone),
    whatsappNumber: phone(answer.whatsappNumber) ?? phone(answer.phone),
    neighbourhood: clean(answer.neighbourhood, 60),
    address: clean(answer.address, 160),
    openingHours: clean(answer.openingHours, 80),
    // Tri-state on purpose. `false` and "we were not told" are different
    // answers, and defaulting the second to the first would quietly mark every
    // captured business as closed at night — which is the only hour we trade.
    nightOpen: typeof answer.nightOpen === "boolean" ? answer.nightOpen : null,
    open24h: typeof answer.open24h === "boolean" ? answer.open24h : null,
    socialUrl: clean(answer.socialUrl, 200),
    products: (answer.products ?? [])
      .map((p) => ({
        name: clean(p?.name, 80) ?? "",
        priceXaf:
          typeof p?.priceXaf === "number" && Number.isFinite(p.priceXaf) && p.priceXaf > 0
            ? Math.round(p.priceXaf)
            : null,
      }))
      .filter((p) => p.name.length >= 3)
      .slice(0, 20),
  };
}

/**
 * What came back, and — when nothing did — why.
 *
 * The reason is carried rather than swallowed because the first version of this
 * could only say *"Couldn't read that screenshot"*, which is what the owner saw
 * while the actual cause (we were sending Moonshot a URL it does not accept)
 * sat in a log on another screen. A capture tool that cannot say what went
 * wrong sends somebody off to retake a photograph that was fine.
 */
export interface CaptureResult {
  draft: MerchantDraft | null;
  error: string | null;
}

/** A screenshot of a business's own page, read into a draft. */
export async function fromScreenshot(photoPath: string | null): Promise<CaptureResult> {
  if (!kimiConfigured()) return { draft: null, error: "No Kimi key is configured." };
  if (!photoPath) return { draft: null, error: "No photo was given." };

  // Sniffed from the bytes, so a mislabelled upload says what it actually is
  // rather than becoming "invalid or unsupported image format" at the provider.
  const image = await readImage(photoPath);
  if (!image.dataUrl) {
    return { draft: null, error: image.problem ?? "Couldn't read that file." };
  }

  const result = await kimiJsonResult<CaptureAnswer>({
    purpose: "merchant.screenshot",
    system: SCREENSHOT_SYSTEM,
    user: "Read this business page and return its details.",
    images: [image.dataUrl],
    schema: SCHEMA as unknown as Record<string, unknown>,
  });
  return finish(result);
}

/**
 * A pasted WhatsApp thread, read into the same draft.
 *
 * The call to confirm a business is happening anyway — this stops it ending in
 * a note somebody has to re-type later. Text only; no vision, no upload, and
 * the thread is never stored.
 */
export async function fromThread(text: string): Promise<CaptureResult> {
  if (!kimiConfigured()) return { draft: null, error: "No Kimi key is configured." };
  const body = text.trim().slice(0, 6000);
  if (body.length < 20) {
    return { draft: null, error: "That is too short to find any business details in." };
  }

  const result = await kimiJsonResult<CaptureAnswer>({
    purpose: "merchant.thread",
    system: THREAD_SYSTEM,
    user: body,
    schema: SCHEMA as unknown as Record<string, unknown>,
  });
  return finish(result);
}

/**
 * One place where a model answer becomes a draft or a sentence.
 *
 * `readable: false` is the model doing the right thing — saying it could not
 * make the page out — and is reported as such rather than as a failure, because
 * the two need different responses from the person holding the phone.
 */
/** What each kind of picture is, and where it should have gone instead. */
const WRONG_TOOL: Record<string, string> = {
  menu: "That is a menu or a price list, not a business page. It would have become a restaurant nobody has confirmed exists. Save the business first, then open its row and use \u201cPhotograph their menu\u201d to read the prices onto it.",
  receipt: "That is a receipt. Receipts are read automatically on the order the rider recorded them against — there is nothing to do here.",
  other: "That does not look like a business page. Capture the profile or the shop front — the part with the name and the phone number.",
};

function finish(result: { answer: CaptureAnswer | null; error: string | null }): CaptureResult {
  if (!result.answer) return { draft: null, error: result.error ?? "No answer came back." };
  if (result.answer.readable === false) {
    return { draft: null, error: "Couldn't make out a business page in that. Try a clearer capture." };
  }

  // The check that stops every photograph becoming a new restaurant. A menu
  // photographed into this panel used to produce a merchant named after the
  // menu's heading — a business in the catalogue that nobody had confirmed and
  // that a rider could be sent to.
  const kind = result.answer.looksLike?.trim().toLowerCase();
  if (kind && kind !== "business_page" && WRONG_TOOL[kind]) {
    return { draft: null, error: WRONG_TOOL[kind] };
  }
  const draft = shapeDraft(result.answer);
  return {
    draft,
    error: draft ? null : "Read it, but found no business name — so there is nothing to save yet.",
  };
}
