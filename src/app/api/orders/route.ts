import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";
import { orderSchema } from "@/lib/validation/orderSchema";
import { estimateDeliveryFee } from "@/lib/orders/pricing";
import { normalizePhone } from "@/lib/utils";
import { INSURED_VALUE_CAP_XAF } from "@/lib/i18n/legal";

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

  const estimatedFee = estimateDeliveryFee(pickupZone, deliveryZone, {
    isMedicine: input.isMedicine,
  });

  const highValueFlag = input.declaredValueXaf > INSURED_VALUE_CAP_XAF;
  const riskFlag =
    pickupZone?.safetyLevel === "RESTRICTED" ||
    pickupZone?.safetyLevel === "NO_GO" ||
    deliveryZone?.safetyLevel === "RESTRICTED" ||
    deliveryZone?.safetyLevel === "NO_GO";

  const orderCode = `UNL-${orderCodeId()}`;
  const otpCode = otpId();

  const order = await prisma.$transaction(async (tx) => {
    // Reuse a repeat guest customer matched by normalized WhatsApp number.
    let customer = await tx.customer.findFirst({ where: { whatsappNumber: whatsapp } });
    if (customer) {
      customer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          fullName: input.fullName,
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
        pickupZoneId: pickupZone?.id ?? null,
        pickupLat: input.pickupLat ?? null,
        pickupLng: input.pickupLng ?? null,
        pickupAddressLabel: input.pickupLocation ?? null,
        deliveryLocation: input.deliveryLocation,
        deliveryLandmark: input.deliveryLandmark || null,
        deliveryZoneId: deliveryZone?.id ?? null,
        deliveryLat: input.deliveryLat ?? null,
        deliveryLng: input.deliveryLng ?? null,
        deliveryAddressLabel: input.deliveryLocation ?? null,
        merchantId: merchant?.id ?? null,
        itemDescription: input.itemDescription,
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

  return NextResponse.json({ orderCode: order.orderCode }, { status: 201 });
}
