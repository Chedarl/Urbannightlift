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
export const SERVICE_LABELS: Record<ServiceType, string> = {
  FOOD_PICKUP: "Food",
  MEDICINE_PICKUP: "Medicine and pharmacy",
  GROCERY_PICKUP: "Groceries",
  SMALL_PARCEL: "Parcels",
  URGENT_ITEM: "Urgent pickup",
  CUSTOM_ERRAND: "Errands",
  MERCHANT_DELIVERY: "Merchant delivery",
  CONCIERGE_NIGHT: "Night concierge",
};
