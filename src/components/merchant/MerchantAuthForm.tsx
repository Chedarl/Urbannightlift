"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/shared/Button";
import { Logo } from "@/components/shared/Logo";

/**
 * Where a shop gets in.
 *
 * Two modes, not two pages, because the honest answer to "do I have an account?"
 * is usually "I don't know" — the record was created when we called them or when
 * they filled in the join form, and setting a PIN is claiming it rather than
 * creating anything. The server tells us which case it is and the form follows.
 */
export function MerchantAuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { locale } = useTranslation();
  const fr = locale === "fr";

  const [mode, setMode] = useState<"login" | "claim">("login");
  const [whatsappNumber, setNumber] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsSignup, setNeedsSignup] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNeedsSignup(false);
    try {
      const res = await fetch("/api/merchant-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, whatsappNumber, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : fr ? "Réessayez." : "Try again.");
        if (data.needsSignup) setNeedsSignup(true);
        // The server knows which mode was actually right; switch rather than
        // making them work it out.
        if (data.alreadyClaimed) setMode("login");
        return;
      }
      router.push(params.get("next") || "/merchant");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-base text-mist-100 focus:border-violet-500 focus:outline-none";

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <Logo />
        <h1 className="mt-6 font-display text-3xl font-bold leading-tight text-mist-100">
          {fr ? "Espace commerçant" : "Merchant sign in"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-mist-400">
          {fr
            ? "Vos commandes, vos prix, et l'heure à laquelle vous fermez — sans passer un appel."
            : "Your orders, your prices, and when you close — without making a phone call."}
        </p>
      </div>

      <div className="mb-5 flex gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1">
        {(["login", "claim"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={
              mode === m
                ? "flex-1 rounded-lg bg-violet-600/30 px-3 py-2 text-sm font-semibold text-violet-200"
                : "flex-1 rounded-lg px-3 py-2 text-sm text-mist-400 hover:text-mist-200"
            }
          >
            {m === "login"
              ? fr ? "J'ai un code" : "I have a PIN"
              : fr ? "Créer mon code" : "Set my PIN"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-xs font-medium text-mist-400">
          {fr ? "Numéro WhatsApp de la boutique" : "Your shop's WhatsApp number"}
          <input
            className={`${input} mt-1.5`}
            inputMode="tel"
            autoComplete="tel"
            placeholder="6XX XX XX XX"
            value={whatsappNumber}
            onChange={(e) => setNumber(e.target.value)}
          />
        </label>

        <label className="text-xs font-medium text-mist-400">
          {mode === "claim"
            ? fr ? "Choisissez un code à 4–6 chiffres" : "Choose a 4–6 digit PIN"
            : fr ? "Votre code" : "Your PIN"}
          <input
            className={`${input} mt-1.5 tracking-[0.4em]`}
            inputMode="numeric"
            autoComplete={mode === "claim" ? "new-password" : "current-password"}
            type="password"
            maxLength={6}
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </label>

        {/* Non-negotiable, on every PIN field in the product. */}
        <p className="flex items-start gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-xs leading-relaxed text-mist-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" />
          {fr
            ? "Ce code est uniquement pour Urban Night Lift. Nous ne demanderons jamais votre code MTN MoMo ou Orange Money."
            : "This PIN is for Urban Night Lift only. We will never ask for your MTN MoMo or Orange Money PIN."}
        </p>

        {error && (
          <div className="rounded-xl border border-restricted/40 bg-restricted/10 px-3 py-2.5 text-sm text-restricted">
            {error}
            {needsSignup && (
              <Link href="/merchant/join" className="mt-1.5 block font-semibold underline">
                {fr ? "Inscrire ma boutique" : "Sign my shop up"}
              </Link>
            )}
          </div>
        )}

        <Button type="submit" disabled={busy || !whatsappNumber || pin.length < 4}>
          {mode === "claim"
            ? fr ? "Créer mon code" : "Set my PIN"
            : fr ? "Se connecter" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs leading-relaxed text-mist-500">
        {fr ? "Votre boutique n'est pas encore chez nous ? " : "Shop not with us yet? "}
        <Link href="/merchant/join" className="font-semibold text-violet-300 underline">
          {fr ? "Inscrivez-la" : "Sign it up"}
        </Link>
        {fr
          ? " — nous appelons pour confirmer, puis vous créez votre code."
          : " — we call to confirm, then you set your PIN."}
      </p>
    </div>
  );
}
