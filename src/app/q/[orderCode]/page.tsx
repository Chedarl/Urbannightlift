import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { hasOrderAccess } from "@/lib/orders/orderAccess";
import { QuotePage } from "@/components/customer/QuotePage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your delivery price — Urban Night Lift",
  description: "Review and accept the delivery price for your Urban Night Lift order.",
  // A quote is somebody's private order; it should never be indexed.
  robots: { index: false, follow: false },
};

/**
 * /q/ABC123 — the short link dispatch sends over WhatsApp.
 *
 * Short on purpose. This address gets typed out by hand, read aloud down a
 * phone line, and pasted into chat, so every extra segment is another chance to
 * lose the customer between the price and their agreement to it.
 *
 * Nothing sensitive is shown before ownership is proved: the price, the item
 * and the delivery area are what the customer needs to decide, and the OTP,
 * their full contact details and the payment screen stay behind the
 * confirmation page as before.
 */
export default async function QuoteLinkPage({
  params,
}: {
  params: Promise<{ orderCode: string }>;
}) {
  const { orderCode } = await params;
  const code = orderCode.toUpperCase();

  const order = await prisma.order.findUnique({
    where: { orderCode: code },
    select: {
      orderCode: true,
      orderStatus: true,
      quoteSentAt: true,
      quoteAcceptedAt: true,
      quoteDeclinedAt: true,
      quotedFeeXaf: true,
      finalDeliveryFeeXaf: true,
      estimatedDeliveryFeeXaf: true,
      itemDescription: true,
      deliveryLocation: true,
      preferredDeliveryTime: true,
      customerVisibleNotes: true,
      customer: { select: { fullName: true, preferredLanguage: true } },
    },
  });

  if (!order) notFound();

  const fr = order.customer.preferredLanguage === "FR";
  const feeXaf = order.quotedFeeXaf ?? order.finalDeliveryFeeXaf ?? order.estimatedDeliveryFeeXaf;

  // Priced but not yet sent, or never priced: say so plainly rather than
  // showing a number nobody has agreed to quote.
  if (!order.quoteSentAt || feeXaf == null) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-xl font-bold">
          {fr ? "Nous préparons votre prix" : "We're working out your price"}
        </h1>
        <p className="mt-3 text-sm text-mist-400">
          {fr
            ? `Commande ${order.orderCode}. Nous vous envoyons le montant sur WhatsApp dès qu'il est prêt.`
            : `Order ${order.orderCode}. We'll send you the amount on WhatsApp as soon as it's ready.`}
        </p>
      </main>
    );
  }

  const cancelled = [
    "CANCELLED_BY_CUSTOMER",
    "CANCELLED_BY_UNL",
    "REJECTED",
  ].includes(order.orderStatus);

  return (
    <QuotePage
      fr={fr}
      quote={{
        orderCode: order.orderCode,
        feeXaf,
        itemDescription: order.itemDescription,
        deliveryLocation: order.deliveryLocation,
        preferredDeliveryTime: order.preferredDeliveryTime,
        note: order.customerVisibleNotes,
        customerName: order.customer.fullName,
        accepted: order.quoteAcceptedAt != null,
        declined: order.quoteDeclinedAt != null,
        cancelled: cancelled && order.quoteDeclinedAt == null,
        // The cookie is set when they placed the order or verified on /track.
        // Without it they are asked for their number before answering.
        verified: await hasOrderAccess(order.orderCode),
      }}
    />
  );
}
