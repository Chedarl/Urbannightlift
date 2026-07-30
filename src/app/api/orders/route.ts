import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";
import { orderSchema } from "@/lib/validation/orderSchema";
import { estimateDeliveryFee } from "@/lib/orders/pricing";
import { decideAutoPrice } from "@/lib/orders/autoPrice";
import { orderMoney } from "@/lib/orders/goodsMoney";
import { normalizePhone } from "@/lib/utils";
import { INSURED_VALUE_CAP_XAF } from "@/lib/i18n/legal";
import { getOperatingSettings, isServiceEnabled } from "@/lib/settings";
import { getCustomerId } from "@/lib/auth/customer";
import { resolveAddress } from "@/lib/locations/resolveAddress";
import { normalizePreferredTime } from "@/lib/orders/timeSlots";
import { notifyNewOrder } from "@/lib/notify/triggers";
import { resolveCode } from "@/lib/ambassadors/accrual";
import { DEFAULT_RIDER_SHARE_PERCENT } from "@/lib/orders/earnings";
import {
  ORDER_ACCESS_COOKIE,
  grantOrderAccessValue,
  orderAccessCookieOptions,
} from "@/lib/orders/orderAccess";

/**
 * Names some order forms substitute when their design has no name field. A
 * placeholder must never overwrite a real name already on file (e.g. the
 * patient name captured on a medicine order).
 */
const PLACEHOLDER_NAMES = new Set(["customer", "client", "sender", "expéditeur", "expediteur"]);

function isPlaceholderName(name: string): boolean {
  return PLACEHOLDER_NAMES.has(name.trim().toLowerCase());
}

const orderCodeId = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 6);

/** POST /api/orders — guest order creation (no auth). */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // A paused service must be refused here too — the UI hiding it is not enough.
  const settings = await getOperatingSettings();
  if (!isServiceEnabled(settings, input.serviceType)) {
    return NextResponse.json({ error: "Service not available yet", code: "SERVICE_DISABLED" }, { status: 403 });
  }

  // Account-first ordering, enforced on the server so a hand-made request cannot
  // slip past the gate the pages put up. When it is on, the order is tied to the
  // signed-in account rather than matched by whatever number was typed.
  const sessionCustomerId = await getCustomerId();
  if (settings.requireAccountToOrder && !sessionCustomerId) {
    return NextResponse.json(
      { error: "Please sign in to place an order.", code: "ACCOUNT_REQUIRED" },
      { status: 401 }
    );
  }

  const whatsapp = normalizePhone(input.whatsappNumber);

  const [pickupZone, deliveryZone, merchant] = await Promise.all([
    input.pickupZoneId
      ? prisma.zone.findUnique({ where: { id: input.pickupZoneId } })
      : null,
    input.deliveryZoneId
      ? prisma.zone.findUnique({ where: { id: input.deliveryZoneId } })
      : null,
    input.merchantId
      ? prisma.merchant.findUnique({ where: { id: input.merchantId } })
      : null,
  ]);

  // When the customer typed a location instead of pinning it we have no
  // coordinates — which leaves the tracking map blank and the fee null. Try to
  // recover them from places we have delivered to before, then our catalogue,
  // then OpenStreetMap. Best-effort only: any failure just means the order is
  // stored exactly as it is today.
  //
  // A repeat customer is looked up by their WhatsApp number first, so their own
  // confirmed drop-off points are used before any general guess.
  const existingCustomer = await prisma.customer.findFirst({
    where: { whatsappNumber: whatsapp },
    select: { id: true },
  });

  const [pickupGeo, deliveryGeo] = await Promise.all([
    input.pickupLat == null || input.pickupLng == null
      ? resolveAddress(input.pickupLocation, existingCustomer?.id).catch(() => null)
      : null,
    input.deliveryLat == null || input.deliveryLng == null
      ? resolveAddress(input.deliveryLocation, existingCustomer?.id).catch(() => null)
      : null,
  ]);

  // A zone recovered from the resolved coordinates also unblocks the fee.
  const effectivePickupZone =
    pickupZone ??
    (pickupGeo?.zoneId ? await prisma.zone.findUnique({ where: { id: pickupGeo.zoneId } }) : null);
  const effectiveDeliveryZone =
    deliveryZone ??
    (deliveryGeo?.zoneId ? await prisma.zone.findUnique({ where: { id: deliveryGeo.zoneId } }) : null);

  const estimatedFee = estimateDeliveryFee(effectivePickupZone, effectiveDeliveryZone, {
    isMedicine: input.isMedicine,
  });

  const highValueFlag = input.declaredValueXaf > INSURED_VALUE_CAP_XAF;
  // Decided below, once the safety flags it depends on are known.
  // Use the effective zones so a zone recovered from a typed address is still
  // safety-checked rather than silently skipping the flag.
  const riskFlag =
    effectivePickupZone?.safetyLevel === "RESTRICTED" ||
    effectivePickupZone?.safetyLevel === "NO_GO" ||
    effectiveDeliveryZone?.safetyLevel === "RESTRICTED" ||
    effectiveDeliveryZone?.safetyLevel === "NO_GO";

  /**
   * When the zone resolves to a firm tier the fee is already exact, so the
   * system issues the quote itself and records the customer's agreement — they
   * saw this precise figure on the review screen and placed the order against
   * it. That takes the order straight to payment instead of parking it in a
   * queue to be told a number it had already calculated.
   *
   * Everything downstream is untouched: payment still has to be verified, cash
   * still settles at the door, and `dispatchBlocker` still holds the rider
   * until the money side is done.
   */
  const priceDecision = decideAutoPrice({
    pickupZone: effectivePickupZone,
    deliveryZone: effectiveDeliveryZone,
    estimatedFeeXaf: estimatedFee,
    highValueFlag,
    riskFlag: Boolean(riskFlag),
  });
  const autoPricedAt = priceDecision.firm ? new Date() : null;

  /**
   * What the customer actually owes, which is not the same as our fee.
   *
   * On a shopping order the goods are a second amount we do not earn on. Before
   * the rider has bought anything the only honest figure is the cap, so this is
   * a ceiling — `orderMoney` says as much and every screen reads it from there.
   */
  const money = orderMoney({
    serviceType: input.serviceType,
    deliveryFeeXaf: estimatedFee,
    goodsCapXaf: input.goodsCapXaf ?? null,
    goodsActualXaf: null,
    overCapApprovedXaf: null,
  });

  /**
   * The up-front payable, which differs by method on a shopping order.
   *
   * Cash settles once at the door, so the payable is the whole thing. Mobile
   * money is paid *now*, before anyone knows the shop's price — so we take the
   * delivery fee only and the goods are handed over in cash on arrival. Taking
   * the cap up front would mean holding money that is not ours and owing a
   * refund, which is exactly what an honest service must never look like.
   */
  const payableNowXaf =
    money.shopping && input.paymentMethod !== "CASH" ? money.deliveryFeeXaf : money.totalXaf;

  const orderCode = `UNL-${orderCodeId()}`;

  const order = await prisma.$transaction(async (tx) => {
    // A signed-in account owns its orders directly. Only when account-first is
    // off (a deliberate guest promotion) do we fall back to matching a repeat
    // customer by their normalized WhatsApp number.
    let customer = sessionCustomerId
      ? await tx.customer.findUnique({ where: { id: sessionCustomerId } })
      : await tx.customer.findFirst({ where: { whatsappNumber: whatsapp } });
    if (customer) {
      // Keep the best name we have: a form-supplied placeholder ("Customer",
      // "Sender") must not clobber a real name captured on an earlier order.
      const keepExistingName =
        isPlaceholderName(input.fullName) && !isPlaceholderName(customer.fullName);
      customer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          ...(keepExistingName ? {} : { fullName: input.fullName }),
          preferredLanguage: input.preferredLanguage,
          alternativePhone: input.alternativePhone || customer.alternativePhone,
          totalOrders: { increment: 1 },
        },
      });
    } else {
      customer = await tx.customer.create({
        data: {
          fullName: input.fullName,
          whatsappNumber: whatsapp,
          alternativePhone: input.alternativePhone || null,
          preferredLanguage: input.preferredLanguage,
          totalOrders: 1,
        },
      });
    }

    // What the code is worth, if one was entered. Never allowed to fail the
    // order: a wrong code buys nothing and the customer still gets their
    // delivery. The amounts are frozen onto the order so changing the terms
    // later never rewrites what somebody was already promised.
    const referral = input.referralCode
      ? await resolveCode({
          rawCode: input.referralCode,
          customerPhone: whatsapp,
          customerId: customer.id,
          feeXaf: estimatedFee ?? 0,
          riderSharePercent: DEFAULT_RIDER_SHARE_PERCENT,
        }).catch(() => null)
      : null;

    if (referral) {
      // A customer belongs to whoever brought them, set once and never moved.
      await tx.customer.updateMany({
        where: { id: customer.id, referredByAmbassadorId: null },
        data: { referredByAmbassadorId: referral.ambassadorId, referredAt: new Date() },
      });
    }

    const created = await tx.order.create({
      data: {
        orderCode,
        customerId: customer.id,
        ambassadorId: referral?.ambassadorId ?? null,
        discountXaf: referral?.discountXaf || null,
        ambassadorCommissionXaf: referral?.commissionXaf || null,
        serviceType: input.serviceType,
        pickupLocation: merchant
          ? `${merchant.merchantName} — ${merchant.address}`
          : input.pickupLocation,
        pickupLandmark: (merchant?.landmark || input.pickupLandmark) || null,
        pickupZoneId: effectivePickupZone?.id ?? null,
        pickupLat: input.pickupLat ?? pickupGeo?.latitude ?? null,
        pickupLng: input.pickupLng ?? pickupGeo?.longitude ?? null,
        pickupGeoSource: pickupGeo?.source ?? null,
        pickupGeoConfidence: pickupGeo?.confidence ?? null,
        pickupAddressLabel: input.pickupLocation ?? null,
        deliveryLocation: input.deliveryLocation,
        deliveryLandmark: input.deliveryLandmark || null,
        deliveryZoneId: effectiveDeliveryZone?.id ?? null,
        deliveryLat: input.deliveryLat ?? deliveryGeo?.latitude ?? null,
        deliveryLng: input.deliveryLng ?? deliveryGeo?.longitude ?? null,
        deliveryGeoSource: deliveryGeo?.source ?? null,
        deliveryGeoConfidence: deliveryGeo?.confidence ?? null,
        deliveryAddressLabel: input.deliveryLocation ?? null,
        merchantId: merchant?.id ?? null,
        itemDescription: input.itemDescription,
        serviceDetails: (input.serviceDetails ?? undefined) as object | undefined,
        quantity: input.quantity,
        declaredValueXaf: input.declaredValueXaf,
        isFragile: input.isFragile,
        needsTemperatureCare: input.needsTemperatureCare,
        isMedicine: input.isMedicine,
        prescriptionRequired: input.isMedicine ? input.prescriptionRequired ?? null : null,
        itemAlreadyPaid: input.itemAlreadyPaid,
        riderPaysAtPickup: input.riderPaysAtPickup,
        preferredDeliveryTime: normalizePreferredTime(input.preferredDeliveryTime),
        specialInstructions: input.specialInstructions || null,
        estimatedDeliveryFeeXaf: estimatedFee,
        // The ceiling the customer agreed to. Required on shopping services.
        goodsCapXaf: input.goodsCapXaf ?? null,
        paymentMethod: input.paymentMethod,
        paymentStatus: "PENDING",
        // A firm price is quoted and agreed at checkout, so the order opens on
        // payment rather than in the review queue.
        orderStatus: autoPricedAt ? "AWAITING_PAYMENT" : "AWAITING_DISPATCHER_REVIEW",
        ...(autoPricedAt
          ? {
              quotedFeeXaf: priceDecision.feeXaf,
              quoteSentAt: autoPricedAt,
              quoteAcceptedAt: autoPricedAt,
            }
          : {}),
        riskFlag: Boolean(riskFlag),
        highValueFlag,
        screenshotUrl: input.screenshotUrl || null,
        // Dropped silently when the feature is off, so a stale client that
        // still shows the microphone cannot smuggle a note past the switch.
        voiceNoteUrl: settings.voiceOrderingEnabled ? input.voiceNoteUrl || null : null,
        voiceNoteSeconds: settings.voiceOrderingEnabled ? (input.voiceNoteSeconds ?? null) : null,
        // Pre-launch rehearsals must never contaminate revenue or counts. The
        // owner switches this off on launch night.
        isTest: settings.testMode,
        // No delivery code yet. It is generated when a rider is actually
        // dispatched, so it is not sitting on a page for the hours before
        // there is anything for it to protect.
      },
    });

    await tx.orderStatusHistory.createMany({
      data: [
        { orderId: created.id, fromStatus: null, toStatus: "NEW_REQUEST", changedByRole: "CUSTOMER" },
        autoPricedAt
          ? {
              orderId: created.id,
              fromStatus: "NEW_REQUEST" as const,
              toStatus: "AWAITING_PAYMENT" as const,
              changedByRole: "SYSTEM" as const,
              // The trail has to say who set the price and on what basis, so a
              // dispatcher reading it later knows this was the zone tariff and
              // not somebody's guess.
              note: `Auto-priced ${priceDecision.feeXaf} XAF from the zone tariff; agreed by the customer at checkout`,
            }
          : {
              orderId: created.id,
              fromStatus: "NEW_REQUEST" as const,
              toStatus: "AWAITING_DISPATCHER_REVIEW" as const,
              changedByRole: "SYSTEM" as const,
              note: `Auto-queued for dispatcher review (${priceDecision.reason})`,
            },
      ],
    });

    await tx.payment.create({
      data: {
        orderId: created.id,
        customerId: customer.id,
        paymentMethod: input.paymentMethod,
        amountXaf: payableNowXaf,
        paymentPhone: input.paymentPhone || null,
        transactionReference: input.transactionReference || null,
        status: "PENDING",
        verificationMethod: "MANUAL",
      },
    });

    return created;
  });

  // An order nobody sees is an order nobody delivers. Alert dispatch now
  // rather than waiting for someone to reload the console.
  await notifyNewOrder(order.orderCode, order.id, input.serviceType);

  // The submitter owns this order — grant access to its private details
  // (delivery OTP, contact, addresses) on the confirmation screen.
  const res = NextResponse.json({ orderCode: order.orderCode }, { status: 201 });
  res.cookies.set(
    ORDER_ACCESS_COOKIE,
    grantOrderAccessValue(req.cookies.get(ORDER_ACCESS_COOKIE)?.value, order.orderCode),
    orderAccessCookieOptions()
  );
  return res;
}
