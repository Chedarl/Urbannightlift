"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Repeat, Home, Check } from "lucide-react";
import { saveDraft, type OrderDraft } from "@/lib/orders/draft";
import { refreshProfile, useCustomerProfile } from "@/lib/account/profile";
import type { PaymentMethod, ServiceType } from "@prisma/client";

/**
 * The end of a delivery, treated as the start of the next one.
 *
 * Reorder already existed, but only inside `/account`, which is not where
 * anybody is standing when they have just received their food. This puts it on
 * the screen they are already looking at, next to the offer to remember where
 * they live.
 */
export function OrderAgain({
  order,
  fr,
}: {
  order: {
    serviceType: ServiceType;
    itemDescription: string;
    serviceDetails: Record<string, unknown> | null;
    quantity: number;
    declaredValueXaf: number;
    pickupLocation: string;
    pickupLandmark: string | null;
    deliveryLocation: string;
    deliveryLandmark: string | null;
    deliveryLat: number | null;
    deliveryLng: number | null;
    paymentMethod: PaymentMethod;
    estimatedFeeXaf: number | null;
    isMedicine: boolean;
    customerName: string;
    customerWhatsapp: string;
    preferredLanguage: "EN" | "FR";
  };
  fr: boolean;
}) {
  const router = useRouter();
  const { profile } = useCustomerProfile();
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const alreadySaved =
    profile?.addresses.some((a) => a.locationText === order.deliveryLocation) ?? false;

  function again() {
    const draft: OrderDraft = {
      fullName: order.customerName,
      whatsappNumber: order.customerWhatsapp,
      preferredLanguage: order.preferredLanguage,
      serviceType: order.serviceType,
      itemDescription: order.itemDescription,
      serviceDetails: (order.serviceDetails ?? undefined) as OrderDraft["serviceDetails"],
      quantity: order.quantity,
      declaredValueXaf: order.declaredValueXaf,
      pickupLocation: order.pickupLocation,
      pickupLandmark: order.pickupLandmark ?? "",
      deliveryLocation: order.deliveryLocation,
      deliveryLandmark: order.deliveryLandmark ?? "",
      deliveryLat: order.deliveryLat,
      deliveryLng: order.deliveryLng,
      paymentMethod: order.paymentMethod,
      itemAlreadyPaid: false,
      riderPaysAtPickup: false,
      isFragile: false,
      needsTemperatureCare: false,
      isMedicine: order.isMedicine,
      acceptedTerms: true,
      estimatedFeeXaf: order.estimatedFeeXaf,
    } as OrderDraft;
    saveDraft(draft);
    router.push("/order/review");
  }

  async function saveAddress() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || (fr ? "Maison" : "Home"),
          locationText: order.deliveryLocation,
          landmark: order.deliveryLandmark ?? undefined,
          lat: order.deliveryLat ?? undefined,
          lng: order.deliveryLng ?? undefined,
        }),
      });
      if (res.ok) {
        setSaved(true);
        refreshProfile();
      }
    } finally {
      setBusy(false);
      setNaming(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4">
      <p className="text-sm text-mist-300">
        {fr
          ? "Merci d'avoir commandé avec nous cette nuit."
          : "Thank you for riding with us tonight."}
      </p>

      <button
        type="button"
        onClick={again}
        className="flex items-center justify-center gap-2 rounded-xl bg-gold-400 px-4 py-2.5 font-display text-sm font-bold text-ink-950 hover:bg-gold-300"
      >
        <Repeat className="h-4 w-4" /> {fr ? "Recommander la même chose" : "Order this again"}
      </button>

      {/* Only a signed-in customer has anywhere to keep an address. */}
      {profile && !alreadySaved && !saved && (
        naming ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              maxLength={40}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={fr ? "Maison, Bureau…" : "Home, Work…"}
              className="w-32 rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-xs text-mist-100 focus:outline-none"
            />
            <button
              type="button"
              onClick={saveAddress}
              disabled={busy}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-mist-100 disabled:opacity-60"
            >
              {fr ? "Enregistrer" : "Save"}
            </button>
            <button type="button" onClick={() => setNaming(false)} className="text-xs text-mist-500">
              {fr ? "Annuler" : "Cancel"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-600 px-3 py-2 text-xs text-mist-400 hover:text-mist-200"
          >
            <Home className="h-3.5 w-3.5" />
            {fr ? "Retenir cette adresse pour la prochaine fois" : "Remember this address for next time"}
          </button>
        )
      )}

      {saved && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-safe">
          <Check className="h-3.5 w-3.5" /> {fr ? "Adresse enregistrée." : "Saved. It'll be one tap next time."}
        </p>
      )}
    </div>
  );
}
