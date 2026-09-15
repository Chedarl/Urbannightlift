import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, limitMessage } from "@/lib/security/rateLimit";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";
import { orderSchema } from "@/lib/validation/orderSchema";
import { estimateDeliveryFee } from "@/lib/orders/pricing";
import { decideAutoPrice } from "@/lib/orders/autoPrice";
import { orderMoney, isShoppingService } from "@/lib/orders/goodsMoney";
import { canChargeToFloat } from "@/lib/merchants/float";
import { merchantPickupLabel } from "@/lib/merchants/complete";
import { normalizePhone } from "@/lib/utils";
import { INSURED_VALUE_CAP_XAF } from "@/lib/i18n/legal";
import { getOperatingSettings, isServiceEnabled } from "@/lib/settings";
import { isPaymentMethodConfigured } from "@/lib/payments/methods";
import { getCustomerId } from "@/lib/auth/customer";
import { resolveAddress } from "@/lib/locations/resolveAddress";
import { normalizePreferredTime } from "@/lib/orders/timeSlots";
import { notifyNewOrder } from "@/lib/notify/triggers";
import { afterOrderCreated } from "@/lib/orders/afterCreate";
import { resolveCode } from "@/lib/ambassadors/accrual";
import { creditToApply } from "@/lib/referrals/rules";
import { DEFAULT_RIDER_SHARE_PERCENT } from "@/lib/orders/earnings";
import { fareRulesFrom } from "@/lib/orders/fare";
import { applyLaunchOffer } from "@/lib/orders/launchOffer";
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

  /*
   * The most generous limit in the product, and deliberately so. A shared
   * office or a student hall ordering separately through one carrier NAT must
   * never be refused — an order is the thing we actively want, and losing a
   * real one costs more than absorbing a scripted one.
   */
  const limit = await checkRateLimit(req, "order");
  if (!limit.ok) {
    return NextResponse.json(
      { error: limitMessage(limit, false) },
      { status: 429, headers: { "Retry-After": String(limit.retryInMinutes * 60) } }
    );
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

  /*
    A way of paying that cannot actually be paid is refused here, not merely
    hidden in the chooser.

    The chooser filters the list — but it filters a *client* list, and until
    now the server took whatever came. So a stale tab, a draft saved before a
    merchant code was removed, or a hand-made request could still create an
    order on Orange Money with no Orange merchant code behind it. That order is
    not a smaller problem than a hidden button: it is a customer who has
    committed, and a payment screen with nothing on it.

    Refused with the reason named, so the client can put them on a method that
    works rather than showing "something went wrong".
  */
  if (!isPaymentMethodConfigured(input.paymentMethod, settings)) {
    return NextResponse.json(
      {
        error: "That way of paying is not available right now. Please choose another.",
        code: "PAYMENT_METHOD_UNAVAILABLE",
      },
      { status: 400 }
    );
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

  /*
    How many deliveries this person has actually received.

    Counted server-side off the Customer row their WhatsApp number resolves to,
    never off a cookie or a device: a guest ordering from a fresh browser every
    night is the same person, and the launch offer is once per person. Counting
    DELIVERED rather than placed is the other half of that — an order that was
    cancelled before a rider moved did not use anybody's free delivery.
  */
  const completedOrders = existingCustomer
    ? await prisma.order.count({
        where: { customerId: existingCustomer.id, orderStatus: "DELIVERED" },
      })
    : 0;

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

  /*
   * The fee, priced by how far the rider actually rides.
   *
   * Coordinates come from the pin the customer dropped, or from whatever the
   * address resolver managed to find — the same two sources the order row
   * itself stores. With neither, `quoteFare` falls back to the minimum plus the
   * zone modifier and marks the result an estimate, which is the honest answer
   * when nobody knows where the parcel is going.
   */
  const pickupPoint =
    input.pickupLat != null && input.pickupLng != null
      ? { lat: input.pickupLat, lng: input.pickupLng }
      : pickupGeo?.latitude != null && pickupGeo?.longitude != null
        ? { lat: pickupGeo.latitude, lng: pickupGeo.longitude }
        : null;
  const deliveryPoint =
    input.deliveryLat != null && input.deliveryLng != null
      ? { lat: input.deliveryLat, lng: input.deliveryLng }
      : deliveryGeo?.latitude != null && deliveryGeo?.longitude != null
        ? { lat: deliveryGeo.latitude, lng: deliveryGeo.longitude }
        : null;

  /*
    Priced with the owner's numbers, not a constant compiled into the bundle.

    `SHOPPING_SERVICES` are the ones where the rider does more than carry —
    they go, queue, buy and come back — and that labour is now its own line
    rather than buried in a delivery fee that then looked three times a Yango
    ride for the same distance.

    The hour is Yaoundé's, not the server's: Vercel runs in UTC and a late-night
    band keyed to the wrong clock would charge the premium in the afternoon.
  */
  const yaoundeHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Douala", hour: "2-digit", hour12: false }).format(new Date())
  );

  const estimatedFee = estimateDeliveryFee(effectivePickupZone, effectiveDeliveryZone, {
    isMedicine: input.isMedicine,
    pickup: pickupPoint,
    delivery: deliveryPoint,
    rules: fareRulesFrom(settings),
    errand: isShoppingService(input.serviceType),
    hour: Number.isFinite(yaoundeHour) ? yaoundeHour : undefined,
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
  /*
    The launch offer, applied to the fee and to nothing else.

    It comes off what the customer pays, never off what the rider earns: the
    earnings split further down still works from `estimatedFee`, the full
    quoted figure. A promotion funded by the person on the bike is not a
    promotion.
  */
  const offer = applyLaunchOffer({
    feeXaf: money.deliveryFeeXaf ?? 0,
    completedOrders,
    capXaf: settings.firstOrderFreeCapXaf ?? 0,
  });

  const payableBeforeOffer =
    money.shopping && input.paymentMethod !== "CASH" ? money.deliveryFeeXaf : money.totalXaf;
  const payableNowXaf = Math.max(0, payableBeforeOffer - offer.waivedXaf);

  /**
   * A merchant with a granted float carries the delivery fee themselves and
   * settles weekly, so their customer is not asked to pay it per order. That is
   * the whole point of the float — it is the thing that makes a small business
   * able to use us at night.
   *
   * The decision goes through `canChargeToFloat` rather than comparing numbers
   * here, so checkout, the admin screen and the accounting cannot disagree about
   * whether a merchant was good for it. A refusal is not an error: the order
   * proceeds on the normal payment path and the reason is left for dispatch.
   */
  let merchantFloatChargeXaf = 0;
  if (merchant && money.deliveryFeeXaf > 0) {
    const ledger = await prisma.merchantFloatLedger.findMany({
      where: { merchantId: merchant.id },
      select: { amountXaf: true, type: true },
    });
    const decision = canChargeToFloat(
      { limitXaf: merchant.floatLimitXaf, suspended: merchant.floatSuspended },
      ledger.map((r) => ({ amountXaf: r.amountXaf, type: r.type as "CHARGE" | "SETTLEMENT" | "ADJUSTMENT" })),
      money.deliveryFeeXaf
    );
    if (decision.ok) merchantFloatChargeXaf = money.deliveryFeeXaf;
  }

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

    /*
     * Credit this customer earned by bringing a friend, actually spent.
     *
     * `spendCredit` existed, was proved, and had **no caller outside its own
     * verify script** — so `/account/referrals` showed people a balance that
     * could never be applied to anything. The ledger write is inlined here
     * rather than calling that helper because it opens its own transaction, and
     * a credit that is deducted outside the transaction that creates the order
     * can be spent against an order that then fails to exist.
     *
     * Bounded by `creditToApply`: never more than they have, and never more
     * than the fee. Credit reduces a bill; it never becomes a payout.
     */
    const creditXaf = creditToApply(
      customer.referralCreditXaf ?? 0,
      // Only against our own fee, and only what the ambassador discount has not
      // already taken off it — two discounts must never add up to more than the
      // thing they are discounting.
      Math.max(0, (estimatedFee ?? 0) - (referral?.discountXaf ?? 0))
    );

    /**
     * Everything taken off this order, from both schemes at once.
     *
     * Stored as one figure because that is what it is to the customer and to
     * the night's accounts — the `ReferralLedger` row above is the record of
     * how much of it was credit, and `ambassadorCommissionXaf` records the
     * other half. Both come out of the company's share; the rider is paid on
     * the full undiscounted fee, which is the rule that has held since v13.
     */
    const discountXaf = (referral?.discountXaf ?? 0) + creditXaf;

    const created = await tx.order.create({
      data: {
        orderCode,
        customerId: customer.id,
        ambassadorId: referral?.ambassadorId ?? null,
        discountXaf: discountXaf || null,
        ambassadorCommissionXaf: referral?.commissionXaf || null,
        serviceType: input.serviceType,
        pickupLocation: merchant ? merchantPickupLabel(merchant) : input.pickupLocation,
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
        // What the customer's own phone heard while they spoke. No key, no
        // account, no signup that can refuse a Cameroonian number — this is the
        // route that always works, and it arrives with the order rather than
        // seconds later.
        voiceTranscript: settings.voiceOrderingEnabled ? input.voiceTranscript || null : null,
        voiceTranscribedAt:
          settings.voiceOrderingEnabled && input.voiceTranscript ? new Date() : null,
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
              note: `Auto-priced ${priceDecision.feeXaf} XAF from the distance and zone; agreed by the customer at checkout`,
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

    // The credit, spent. Written here rather than through `spendCredit` because
    // that helper opens its own transaction, and a balance decremented outside
    // this one could be spent against an order that then fails to be created.
    if (creditXaf > 0) {
      await tx.referralLedger.create({
        data: {
          customerId: customer.id,
          orderId: created.id,
          amountXaf: -creditXaf,
          type: "SPENT",
          note: `Applied to ${created.orderCode}`,
        },
      });
      await tx.customer.update({
        where: { id: customer.id },
        data: { referralCreditXaf: { decrement: creditXaf } },
      });
    }

    await tx.payment.create({
      data: {
        orderId: created.id,
        customerId: customer.id,
        paymentMethod: input.paymentMethod,
        /*
         * **Net of the discount, which it was not.**
         *
         * `discountXaf` was written onto the order and the payable was computed
         * from the gross fee, so a customer who used an ambassador code was
         * recorded as having a 500 XAF discount and then asked for the full
         * amount — on the payment card, in the USSD string, and in this row.
         * The ambassador was paid a commission on a saving their customer never
         * received. Every screen reads the payable from here, so this is the
         * one place it had to be fixed.
         */
        amountXaf: Math.max(0, payableNowXaf - discountXaf),
        paymentPhone: input.paymentPhone || null,
        transactionReference: input.transactionReference || null,
        status: "PENDING",
        verificationMethod: "MANUAL",
      },
    });

    // The merchant carries this fee on their float and settles it weekly. The
    // unique (orderId, type) index means a retried request cannot double-charge.
    if (merchantFloatChargeXaf > 0 && merchant) {
      await tx.merchantFloatLedger.create({
        data: {
          merchantId: merchant.id,
          orderId: created.id,
          amountXaf: merchantFloatChargeXaf,
          type: "CHARGE",
          note: `Delivery fee for ${created.orderCode}`,
        },
      });
    }

    return created;
  });

  // An order nobody sees is an order nobody delivers. Alert dispatch now
  // rather than waiting for someone to reload the console.
  await notifyNewOrder(order.orderCode, order.id, input.serviceType);

  /*
   * Two opinions for the dispatcher: what the voice note says, and whether
   * anything in the free text is worth a glance before a rider is sent.
   *
   * Deliberately NOT awaited. Both take seconds, both are advisory, and the
   * customer is standing there having already pressed the button. The rule that
   * has held across this whole codebase applies: an order must never fail, or
   * even wait, because a model did.
   *
   * Only what they typed is sent — never their name, number or address.
   */
  void afterOrderCreated({
    orderId: order.id,
    voiceNoteUrl: settings.voiceOrderingEnabled ? input.voiceNoteUrl || null : null,
    browserTranscript: settings.voiceOrderingEnabled ? input.voiceTranscript || null : null,
    freeText: [input.itemDescription, input.specialInstructions].filter(Boolean).join(" — "),
  });

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
