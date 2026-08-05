import type { ServiceType } from "@prisma/client";

/**
 * What each service is called, in words a customer would use.
 *
 * The rest of the product renders service names through i18n keys resolved in a
 * React component, which is the right place for them and the wrong shape for a
 * prompt: the assistant needs a plain string on the server, before any
 * component exists. Kept here rather than reaching into the dictionary so a
 * translator changing a label can never accidentally change what the model is
 * told a service *is*.
 */
const EN: Record<ServiceType, string> = {
  FOOD_PICKUP: "Food",
  MEDICINE_PICKUP: "Medicine and pharmacy",
  GROCERY_PICKUP: "Groceries",
  SMALL_PARCEL: "Parcels",
  URGENT_ITEM: "Urgent pickup",
  CUSTOM_ERRAND: "Errands",
  MERCHANT_DELIVERY: "Merchant delivery",
  CONCIERGE_NIGHT: "Night concierge",
};

const FR: Record<ServiceType, string> = {
  FOOD_PICKUP: "Nourriture",
  MEDICINE_PICKUP: "Médicaments et pharmacie",
  GROCERY_PICKUP: "Courses",
  SMALL_PARCEL: "Colis",
  URGENT_ITEM: "Ramassage urgent",
  CUSTOM_ERRAND: "Courses diverses",
  MERCHANT_DELIVERY: "Livraison commerçant",
  CONCIERGE_NIGHT: "Conciergerie de nuit",
};

/**
 * The service names in the language being spoken.
 *
 * These used to be English only, so a French conversation came back naming the
 * services in English — the exact "some words are still in the other language"
 * the owner reported. The assistant is told to answer in French; it cannot do
 * that with an English word list.
 */
export function serviceLabels(fr: boolean): Record<ServiceType, string> {
  return fr ? FR : EN;
}

/** @deprecated use serviceLabels(fr) — kept so nothing breaks mid-refactor. */
export const SERVICE_LABELS = EN;
