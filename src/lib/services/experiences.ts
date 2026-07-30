import type { ServiceType } from "@prisma/client";

/**
 * Per-service "experience" config that makes each order page feel distinct:
 * its own accent, gradient, hero motif, lead copy, layout variant, and which
 * details lead. The shared order engine reads this to theme + arrange itself.
 */
export type OrderLayout = "standard" | "conversational" | "merchant";

export interface ServiceExperience {
  service: ServiceType;
  accent: string; // hex, drives the whole page tint
  gradient: string; // tailwind gradient classes for hero
  icon: string; // lucide icon name (resolved in component)
  layout: OrderLayout;
  // i18n keys (namespace: exp.<service>.*)
  titleKey: string;
  taglineKey: string;
  leadFieldKey: string; // label/placeholder for the primary "what do you need" field
  motif: "plate" | "cross" | "basket" | "box" | "bolt" | "chat" | "storefront";
}

export const SERVICE_EXPERIENCES: Record<ServiceType, ServiceExperience> = {
  FOOD_PICKUP: {
    service: "FOOD_PICKUP",
    accent: "#f59e0b",
    gradient: "from-amber-500/30 via-orange-600/10 to-transparent",
    icon: "UtensilsCrossed",
    layout: "standard",
    titleKey: "exp.FOOD_PICKUP.title",
    taglineKey: "exp.FOOD_PICKUP.tagline",
    leadFieldKey: "exp.FOOD_PICKUP.lead",
    motif: "plate",
  },
  MEDICINE_PICKUP: {
    service: "MEDICINE_PICKUP",
    accent: "#2dd4bf",
    gradient: "from-teal-500/30 via-emerald-600/10 to-transparent",
    icon: "Pill",
    layout: "standard",
    titleKey: "exp.MEDICINE_PICKUP.title",
    taglineKey: "exp.MEDICINE_PICKUP.tagline",
    leadFieldKey: "exp.MEDICINE_PICKUP.lead",
    motif: "cross",
  },
  GROCERY_PICKUP: {
    service: "GROCERY_PICKUP",
    accent: "#22c55e",
    gradient: "from-green-500/30 via-emerald-600/10 to-transparent",
    icon: "ShoppingBasket",
    layout: "standard",
    titleKey: "exp.GROCERY_PICKUP.title",
    taglineKey: "exp.GROCERY_PICKUP.tagline",
    leadFieldKey: "exp.GROCERY_PICKUP.lead",
    motif: "basket",
  },
  SMALL_PARCEL: {
    service: "SMALL_PARCEL",
    accent: "#3b82f6",
    gradient: "from-blue-500/30 via-indigo-600/10 to-transparent",
    icon: "Package",
    layout: "standard",
    titleKey: "exp.SMALL_PARCEL.title",
    taglineKey: "exp.SMALL_PARCEL.tagline",
    leadFieldKey: "exp.SMALL_PARCEL.lead",
    motif: "box",
  },
  URGENT_ITEM: {
    service: "URGENT_ITEM",
    accent: "#ef4444",
    gradient: "from-red-500/30 via-amber-500/15 to-transparent",
    icon: "Zap",
    layout: "standard",
    titleKey: "exp.URGENT_ITEM.title",
    taglineKey: "exp.URGENT_ITEM.tagline",
    leadFieldKey: "exp.URGENT_ITEM.lead",
    motif: "bolt",
  },
  CUSTOM_ERRAND: {
    service: "CUSTOM_ERRAND",
    accent: "#c084fc",
    gradient: "from-violet-500/30 via-fuchsia-600/10 to-transparent",
    icon: "ClipboardList",
    layout: "conversational",
    titleKey: "exp.CUSTOM_ERRAND.title",
    taglineKey: "exp.CUSTOM_ERRAND.tagline",
    leadFieldKey: "exp.CUSTOM_ERRAND.lead",
    motif: "chat",
  },
  CONCIERGE_NIGHT: {
    service: "CONCIERGE_NIGHT",
    accent: "#9645de",
    gradient: "from-violet-500/30 via-indigo-600/10 to-transparent",
    icon: "ClipboardList",
    layout: "conversational",
    titleKey: "exp.CONCIERGE_NIGHT.title",
    taglineKey: "exp.CONCIERGE_NIGHT.tagline",
    leadFieldKey: "exp.CONCIERGE_NIGHT.lead",
    motif: "chat",
  },
  MERCHANT_DELIVERY: {
    service: "MERCHANT_DELIVERY",
    accent: "#d946ef",
    gradient: "from-fuchsia-500/30 via-purple-600/10 to-transparent",
    icon: "Store",
    layout: "merchant",
    titleKey: "exp.MERCHANT_DELIVERY.title",
    taglineKey: "exp.MERCHANT_DELIVERY.tagline",
    leadFieldKey: "exp.MERCHANT_DELIVERY.lead",
    motif: "storefront",
  },
};

export function getExperience(service: string | null | undefined): ServiceExperience {
  if (service && service in SERVICE_EXPERIENCES) {
    return SERVICE_EXPERIENCES[service as ServiceType];
  }
  return SERVICE_EXPERIENCES.FOOD_PICKUP;
}
