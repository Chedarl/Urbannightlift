"use client";

import { useRouter } from "next/navigation";
import { Repeat, Sparkles } from "lucide-react";
import { saveDraft } from "@/lib/orders/draft";
import { reorderDraft, useCustomerProfile } from "@/lib/account/profile";

/**
 * "Welcome back, Alice — your 6th night with us."
 *
 * Small, but it is the difference between a form and a relationship. The count
 * comes from `totalOrders`, which the order API already maintains, so it is the
 * real number and not a guess. Guests see nothing.
 */
export function WelcomeBack({ accent, fr, showReorder = true }: { accent: string; fr: boolean; showReorder?: boolean }) {
  const { profile } = useCustomerProfile();
  const router = useRouter();

  if (!profile) return null;

  const firstName = profile.fullName.trim().split(/\s+/)[0];
  // A placeholder name from a guest checkout is not worth greeting by.
  const named = firstName.length > 1 && !/^(customer|client)$/i.test(firstName);
  const next = profile.totalOrders + 1;

  function again() {
    if (!profile?.lastOrder) return;
    saveDraft(reorderDraft(profile, profile.lastOrder));
    router.push("/order/review");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink-700 bg-ink-900/60 px-3.5 py-2.5">
      <p className="text-xs text-mist-300">
        <Sparkles className="mr-1.5 inline h-3.5 w-3.5" style={{ color: accent }} />
        {named
          ? fr
            ? `Bon retour, ${firstName} — `
            : `Welcome back, ${firstName} — `
          : fr
            ? "Bon retour — "
            : "Welcome back — "}
        <span className="text-mist-400">{nightLine(next, fr)}</span>
      </p>

      {showReorder && profile.lastOrder && (
        <button
          type="button"
          onClick={again}
          className="flex items-center gap-1.5 rounded-xl border border-ink-600 px-2.5 py-1.5 text-[11px] font-semibold text-mist-200 hover:text-mist-100"
        >
          <Repeat className="h-3 w-3" /> {fr ? "Refaire la dernière" : "Order the same again"}
        </button>
      )}
    </div>
  );
}

function nightLine(n: number, fr: boolean): string {
  if (fr) return n === 1 ? "votre première nuit avec nous" : `votre ${n}ᵉ nuit avec nous`;
  return n === 1 ? "your first night with us" : `your ${ordinal(n)} night with us`;
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}
