import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";
import { orderSchema } from "@/lib/validation/orderSchema";
import { estimateDeliveryFee } from "@/lib/orders/pricing";
import { normalizePhone } from "@/lib/utils";
import { INSURED_VALUE_CAP_XAF } from "@/lib/i18n/legal";
import { getOperatingSettings, isServiceEnabled } from "@/lib/settings";
import { resolveAddress } from "@/lib/locations/resolveAddress";
import { notifyNewOrder } from "@/lib/notify/triggers";
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
const otpId = customAlphabet("0123456789", 4);

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
  // Use the effective zones so a zone recovered from a typed address is still
  // safety-checked rather than silently skipping the flag.
  const riskFlag =
    effectivePickupZone?.safetyLevel === "RESTRICTED" ||
    effectivePickupZone?.safetyLevel === "NO_GO" ||
    effectiveDeliveryZone?.safetyLevel === "RESTRICTED" ||
    effectiveDeliveryZone?.safetyLevel === "NO_GO";

  const orderCode = `UNL-${orderCodeId()}`;
  const otpCode = otpId();

  const order = await prisma.$transaction(async (tx) => {
    // Reuse a repeat guest customer matched by normalized WhatsApp number.
    let customer = await tx.customer.findFirst({ where: { whatsappNumber: whatsapp } });
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

    const created = await tx.order.create({
      data: {
        orderCode,
        customerId: customer.id,
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
        preferredDeliveryTime: input.preferredDeliveryTime || null,
        specialInstructions: input.specialInstructions || null,
        estimatedDeliveryFeeXaf: estimatedFee,
        paymentMethod: input.paymentMethod,
        paymentStatus: "PENDING",
        orderStatus: "AWAITING_DISPATCHER_REVIEW",
        riskFlag: Boolean(riskFlag),
        highValueFlag,
        screenshotUrl: input.screenshotUrl || null,
        otpCode,
      },
    });

    await tx.orderStatusHistory.createMany({
      data: [
        { orderId: created.id, fromStatus: null, toStatus: "NEW_REQUEST", changedByRole: "CUSTOMER" },
        {
          orderId: created.id,
          fromStatus: "NEW_REQUEST",
          toStatus: "AWAITING_DISPATCHER_REVIEW",
          changedByRole: "SYSTEM",
          note: "Auto-queued for dispatcher review",
        },
      ],
    });

    await tx.payment.create({
      data: {
        orderId: created.id,
        customerId: customer.id,
        paymentMethod: input.paymentMethod,
        amountXaf: estimatedFee ?? 0,
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
