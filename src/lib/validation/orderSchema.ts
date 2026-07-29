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
  // Structured per-service payload (food/medicine/grocery item lists, parcel
  // dimensions, urgency reason, errand steps…). Shape varies by service; stored
  // as JSON. Kept loose here — each service form validates its own shape client-side.
  serviceDetails: z.record(z.string(), z.unknown()).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(99),
  declaredValueXaf: z.coerce.number().int().min(0).max(10_000_000),
  // "ASAP" or a 24-hour "HH:MM" chosen from the operating window. Older orders
  // and saved drafts hold free text, so anything else is still accepted here and
  // normalized on the server rather than failing the customer at the last step.
  preferredDeliveryTime: z.string().trim().max(100).optional().or(z.literal("")),
  specialInstructions: z.string().trim().max(1000).optional().or(z.literal("")),
  itemAlreadyPaid: z.boolean(),
  riderPaysAtPickup: z.boolean(),
  isFragile: z.boolean(),
  needsTemperatureCare: z.boolean(),
  isMedicine: z.boolean(),
  prescriptionRequired: z.enum(["YES", "NO", "NOT_SURE"]).optional(),
  screenshotUrl: z.string().max(500).optional().or(z.literal("")),
  /// A voice note instead of a filled-in form. Stored path only — the file
  /// itself lives in a private bucket and is never exposed publicly.
  voiceNoteUrl: z.string().max(500).optional().or(z.literal("")),
  voiceNoteSeconds: z.coerce.number().int().min(0).max(600).optional().nullable(),

  // Payment (tracking only — never credentials)
  paymentMethod: z.enum(["MTN_MOMO", "ORANGE_MONEY", "CASH"]),
  paymentPhone: z.string().trim().max(20).optional().or(z.literal("")),
  transactionReference: z.string().trim().max(100).optional().or(z.literal("")),

  /// An ambassador's code, if the customer was sent by one. Never required —
  /// a wrong or expired code must quietly buy nothing rather than block an order.
  referralCode: z.string().trim().max(20).optional().or(z.literal("")),

  acceptedTerms: z.literal(true),
});

export type OrderInput = z.infer<typeof orderSchema>;
