import "server-only";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { ADMIN, UPLOADS_NOTE, plain, shell, type Field } from "@/lib/email/templates";
import { formatXaf } from "@/lib/utils";
import { formatSlot } from "@/lib/orders/timeSlots";

/**
 * One email per thing that happens, addressed to whoever runs operations.
 *
 * Each one answers the same question — what just happened, and does it need
 * me right now — and each carries everything the person typed. What they
 * uploaded is linked rather than attached; see `send.ts` for why.
 *
 * Nothing here is allowed to throw. Every caller has already done real work.
 */

async function shouldEmailOrders(): Promise<boolean> {
  const s = await prisma.operatingSettings.findUnique({
    where: { id: 1 },
    select: { emailOnEveryOrder: true },
  });
  return s?.emailOnEveryOrder ?? true;
}

/** Renders and sends in one step, so every message looks the same. */
async function deliver(opts: {
  event: string;
  subject: string;
  heading: string;
  subheading: string;
  fields: Field[];
  actionLabel: string;
  actionUrl: string;
  note?: string;
  footnote?: string;
  entityType?: string;
  entityId?: string;
  replyTo?: string;
}) {
  return sendEmail({
    subject: opts.subject,
    html: shell(opts),
    text: plain(opts),
    event: opts.event,
    entityType: opts.entityType,
    entityId: opts.entityId,
    replyTo: opts.replyTo,
  });
}

/** A new order. The whole order, so it can be judged without opening anything. */
export async function emailNewOrder(orderId: string): Promise<void> {
  try {
    if (!(await shouldEmailOrders())) return;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        pickupZone: { select: { zoneName: true, tier: true } },
        deliveryZone: { select: { zoneName: true, tier: true } },
        merchant: { select: { merchantName: true, phone: true } },
        ambassador: { select: { code: true, fullName: true } },
      },
    });
    if (!order) return;

    const uploaded = [
      order.screenshotUrl ? "payment screenshot" : null,
      order.voiceNoteUrl ? "voice note" : null,
      order.isMedicine ? "prescription (if provided)" : null,
    ].filter(Boolean);

    await deliver({
      event: "order.created",
      entityType: "order",
      entityId: order.id,
      subject: `${order.isTest ? "[TEST] " : ""}New order ${order.orderCode} — ${label(order.serviceType)}`,
      heading: `New order ${order.orderCode}`,
      subheading: order.isTest
        ? "Test mode is on — this order does not count as real trading."
        : "Waiting for review and a price.",
      fields: [
        { label: "Service", value: label(order.serviceType) },
        { label: "Customer", value: order.customer?.fullName },
        { label: "WhatsApp", value: order.customer?.whatsappNumber },
        { label: "What they want", value: order.itemDescription },
        { label: "Quantity", value: order.quantity > 1 ? String(order.quantity) : null },
        { label: "Declared value", value: order.declaredValueXaf ? formatXaf(order.declaredValueXaf) : null },
        { label: "Merchant", value: order.merchant ? `${order.merchant.merchantName}${order.merchant.phone ? ` · ${order.merchant.phone}` : ""}` : null },
        { label: "Collect from", value: joinPlace(order.pickupLocation, order.pickupLandmark, order.pickupZone?.zoneName) },
        { label: "Deliver to", value: joinPlace(order.deliveryLocation, order.deliveryLandmark, order.deliveryZone?.zoneName) },
        { label: "Wanted for", value: order.preferredDeliveryTime ? formatSlot(order.preferredDeliveryTime, false) : null },
        { label: "Payment", value: paymentLabel(order.paymentMethod) },
        { label: "Estimated fee", value: order.estimatedDeliveryFeeXaf ? formatXaf(order.estimatedDeliveryFeeXaf) : "to be priced" },
        { label: "Instructions", value: order.specialInstructions },
        { label: "Referred by", value: order.ambassador ? `${order.ambassador.code} (${order.ambassador.fullName})` : null },
        { label: "They also sent", value: uploaded.length ? uploaded.join(", ") : null },
      ],
      note: uploaded.length ? UPLOADS_NOTE : undefined,
      actionLabel: "Open this order",
      actionUrl: ADMIN.order(order.id),
      footnote: `Placed ${order.createdAt.toISOString()}`,
    });
  } catch {
    // Never let a notification break order creation.
  }
}

/** Somebody wants to ride for us. */
export async function emailRiderApplication(applicationId: string): Promise<void> {
  try {
    const a = await prisma.riderApplication.findUnique({ where: { id: applicationId } });
    if (!a) return;

    await deliver({
      event: "rider.applied",
      entityType: "rider_application",
      entityId: a.id,
      subject: `Rider application — ${a.fullName}`,
      heading: "Somebody wants to ride for us",
      subheading: "Their ID needs checking before they can be approved.",
      fields: [
        { label: "Name", value: a.fullName },
        { label: "WhatsApp", value: a.whatsappNumber },
        { label: "Other phone", value: a.phone !== a.whatsappNumber ? a.phone : null },
        { label: "Email", value: a.email },
        { label: "Lives in", value: a.neighbourhood },
        { label: "Zones they know", value: a.zonePreference.length ? `${a.zonePreference.length} selected` : "any" },
        { label: "ID number", value: a.idCardNumber },
        { label: "Rides", value: a.vehicleType },
        { label: "Bike", value: a.vehicleRef },
        { label: "Has a licence", value: a.hasLicence ? "yes" : "no" },
        { label: "Owns the bike", value: a.ownsVehicle ? "yes" : "no" },
        { label: "Experience", value: a.yearsExperience != null ? `${a.yearsExperience} years` : null },
        { label: "Available", value: a.availability },
        { label: "Notes", value: a.notes },
        {
          label: "Documents",
          value: [a.idCardFrontUrl && "ID front", a.idCardBackUrl && "ID back", a.photoUrl && "photo"]
            .filter(Boolean)
            .join(", ") || "none uploaded",
        },
      ],
      note: UPLOADS_NOTE,
      actionLabel: "Review this application",
      actionUrl: ADMIN.riderApplications(),
      footnote: "Approving is what creates their account. Applying alone gives them no access to anything.",
    });
  } catch {
    /* never break the application */
  }
}

/** Somebody wants a referral code. */
export async function emailAmbassadorSignup(ambassadorId: string): Promise<void> {
  try {
    const a = await prisma.ambassador.findUnique({ where: { id: ambassadorId } });
    if (!a) return;

    await deliver({
      event: "ambassador.applied",
      entityType: "ambassador",
      entityId: a.id,
      subject: `Ambassador application — ${a.code} (${a.fullName})`,
      heading: "A new ambassador applied",
      subheading: `They want the code ${a.code}. It earns nothing until you approve it.`,
      fields: [
        { label: "Name", value: a.fullName },
        { label: "Code they want", value: a.code },
        { label: "WhatsApp", value: a.whatsappNumber },
        { label: "Pay them via", value: a.payoutMethod },
        { label: "Payout number", value: a.payoutNumber },
        { label: "How they'll promote", value: a.reach },
      ],
      actionLabel: "Review and approve",
      actionUrl: ADMIN.ambassadors(),
      footnote: "Approving is a standing commitment to pay this person out of our margin.",
    });
  } catch {
    /* never break the signup */
  }
}

/** A business added itself to the catalogue. */
export async function emailMerchantSignup(merchantId: string): Promise<void> {
  try {
    const m = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { products: { select: { name: true, priceXaf: true }, take: 5 } },
    });
    if (!m) return;

    await deliver({
      event: "merchant.applied",
      entityType: "merchant",
      entityId: m.id,
      subject: `Business wants to join — ${m.merchantName}`,
      heading: "A business wants to join",
      subheading: "They filled this in themselves, which means they are trading tonight.",
      fields: [
        { label: "Business", value: m.merchantName },
        { label: "Category", value: m.category },
        { label: "WhatsApp", value: m.whatsappNumber ?? m.phone },
        { label: "Where", value: joinPlace(m.address, m.landmark, m.neighbourhood) },
        { label: "Hours", value: m.openingHours },
        { label: "Open at night", value: m.nightOpen ? "yes" : "no" },
        { label: "Social page", value: m.socialUrl },
        {
          label: "Prices they gave",
          value: m.products.length
            ? m.products.map((p) => `${p.name}${p.priceXaf ? ` — ${formatXaf(p.priceXaf)}` : ""}`).join("; ")
            : null,
        },
      ],
      actionLabel: "Review this business",
      actionUrl: ADMIN.merchants(),
      footnote: "Unverified until you check it. Customers cannot see it yet.",
    });
  } catch {
    /* never break the signup */
  }
}

/** A customer claimed an account. */
export async function emailNewCustomer(customerId: string): Promise<void> {
  try {
    const c = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!c) return;

    await deliver({
      event: "customer.signed_up",
      entityType: "customer",
      entityId: c.id,
      subject: `New account — ${c.fullName}`,
      heading: "Somebody created an account",
      subheading:
        c.totalOrders > 0
          ? `They had already ordered ${c.totalOrders} time${c.totalOrders === 1 ? "" : "s"} as a guest — those orders are now theirs.`
          : "Their first time with us.",
      fields: [
        { label: "Name", value: c.fullName },
        { label: "WhatsApp", value: c.whatsappNumber },
        { label: "Language", value: c.preferredLanguage },
        { label: "Orders so far", value: String(c.totalOrders) },
      ],
      actionLabel: "See our customers",
      actionUrl: ADMIN.customers(),
    });
  } catch {
    /* never break signup */
  }
}

/** Money says it has arrived. This one is worth interrupting somebody for. */
export async function emailPaymentSubmitted(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, payments: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!order) return;
    const p = order.payments[0];

    await deliver({
      event: "payment.submitted",
      entityType: "order",
      entityId: order.id,
      subject: `Payment to check — ${order.orderCode}`,
      heading: `Payment submitted for ${order.orderCode}`,
      subheading: "Nothing is dispatched until somebody confirms the money arrived.",
      fields: [
        { label: "Customer", value: order.customer?.fullName },
        { label: "WhatsApp", value: order.customer?.whatsappNumber },
        { label: "Amount", value: p?.amountXaf ? formatXaf(p.amountXaf) : null },
        { label: "Method", value: paymentLabel(order.paymentMethod) },
        { label: "Reference", value: p?.transactionReference },
        { label: "Paid from", value: p?.paymentPhone },
        { label: "Proof", value: p?.proofScreenshotUrl ? "screenshot uploaded" : "none" },
      ],
      note: p?.proofScreenshotUrl ? UPLOADS_NOTE : undefined,
      actionLabel: "Verify this payment",
      actionUrl: ADMIN.order(order.id),
    });
  } catch {
    /* never break payment submission */
  }
}

function joinPlace(...parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p && p.trim()).join(" — ");
}

function label(serviceType: string): string {
  return serviceType
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function paymentLabel(method: string): string {
  if (method === "MTN_MOMO") return "MTN Mobile Money";
  if (method === "ORANGE_MONEY") return "Orange Money";
  return "Cash on delivery";
}
