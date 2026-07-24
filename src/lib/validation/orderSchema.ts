import { z } from "zod";

/**
 * Shared client/server validation for the guest order form.
 * Deliberately contains NO field for any payment PIN, secret code, OTP, or
 * bank credential — the system must never ask for or store those.
 */
export const orderSchema = z.object({
  // Customer
  fullName: z.string().trim().min(2).max(120),
  whatsappNumber: z.string().trim().min(8).max(20),
  preferredLanguage: z.enum(["EN", "FR"]),
  alternativePhone: z.string().trim().max(20).optional().or(z.literal("")),

  // Order
  serviceType: z.enum([
    "FOOD_PICKUP",
    "MEDICINE_PICKUP",
    "GROCERY_PICKUP",
    "SMALL_PARCEL",
    "URGENT_ITEM",
    "CUSTOM_ERRAND",
    "MERCHANT_DELIVERY",
  ]),
  merchantId: z.string().optional().or(z.literal("")),
  pickupLocation: z.string().trim().min(3).max(300),
  pickupLandmark: z.string().trim().max(300).optional().or(z.literal("")),
  deliveryLocation: z.string().trim().min(3).max(300),
  deliveryLandmark: z.string().trim().max(300).optional().or(z.literal("")),
  pickupZoneId: z.string().optional().or(z.literal("")),
  deliveryZoneId: z.string().optional().or(z.literal("")),
  // Map-picked coordinates (optional — free-text fallback still allowed)
  pickupLat: z.coerce.number().optional().nullable(),
  pickupLng: z.coerce.number().optional().nullable(),
  deliveryLat: z.coerce.number().optional().nullable(),
  deliveryLng: z.coerce.number().optional().nullable(),
  itemDescription: z.string().trim().min(3).max(1000),
  quantity: z.coerce.number().int().min(1).max(99),
  declaredValueXaf: z.coerce.number().int().min(0).max(10_000_000),
  preferredDeliveryTime: z.string().trim().max(100).optional().or(z.literal("")),
  specialInstructions: z.string().trim().max(1000).optional().or(z.literal("")),
  itemAlreadyPaid: z.boolean(),
  riderPaysAtPickup: z.boolean(),
  isFragile: z.boolean(),
  needsTemperatureCare: z.boolean(),
  isMedicine: z.boolean(),
  prescriptionRequired: z.enum(["YES", "NO", "NOT_SURE"]).optional(),
  screenshotUrl: z.string().max(500).optional().or(z.literal("")),

  // Payment (tracking only — never credentials)
  paymentMethod: z.enum(["MTN_MOMO", "ORANGE_MONEY"]),
  paymentPhone: z.string().trim().max(20).optional().or(z.literal("")),
  transactionReference: z.string().trim().max(100).optional().or(z.literal("")),

  acceptedTerms: z.literal(true),
});

export type OrderInput = z.infer<typeof orderSchema>;
