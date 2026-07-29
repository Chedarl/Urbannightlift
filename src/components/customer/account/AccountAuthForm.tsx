"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, ShieldCheck, UserPlus, LogIn } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { refreshProfile } from "@/lib/account/profile";

const inputCls =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-500 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-mist-300";

/**
 * Customer sign-up / sign-in with a WhatsApp number and a short PIN.
 * No SMS or OTP — those cost per message in Cameroon — so the number the
 * customer already orders with is the identity, protected by a PIN + lockout.
 */
export function AccountAuthForm({ mode }: { mode: "signup" | "login" }) {
  const { t, locale } = useTranslation();
  const fr = locale === "fr";
  const router = useRouter();
  const isSignup = mode === "signup";

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function messageFor(code: string, minutesLeft?: number): string {
    switch (code) {
      case "invalid_phone":
        return fr ? "Entrez un numéro WhatsApp valide." : "Enter a valid WhatsApp number.";
      case "invalid_pin":
        return fr
          ? "Le code doit contenir 4 à 6 chiffres."
          : "Your PIN must be 4 to 6 digits.";
      case "invalid_name":
        return fr ? "Entrez votre nom complet." : "Enter your full name.";
      case "account_exists":
        return fr
          ? "Un compte existe déjà pour ce numéro. Connectez-vous."
          : "An account already exists for this number. Please log in.";
      case "locked":
        return fr
          ? `Trop de tentatives. Réessayez dans ${minutesLeft ?? 15} minutes.`
          : `Too many attempts. Try again in ${minutesLeft ?? 15} minutes.`;
      default:
        return fr
          ? "Numéro ou code incorrect."
          : "That number or PIN is incorrect.";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSignup && pin !== pin2) {
      setError(fr ? "Les deux codes ne correspondent pas." : "The two PINs don't match.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch(`/api/account/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isSignup
            ? { fullName, whatsappNumber: phone, pin, preferredLanguage: fr ? "FR" : "EN" }
            : { whatsappNumber: phone, pin }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(messageFor(data.error ?? "invalid", data.minutesLeft));
        return;
      }
      refreshProfile();
      router.push("/account");
      router.refresh();
    } catch {
      setError(fr ? "Une erreur est survenue." : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-5 px-4 pb-16 pt-4">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-mist-400 hover:text-mist-200">
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold">
          {isSignup
            ? fr ? "Créer un compte" : "Create your account"
            : fr ? "Se connecter" : "Log in"}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-mist-400">
          {isSignup
            ? fr
              ? "Commandez plus vite, retrouvez vos adresses et votre historique. Si vous avez déjà commandé avec ce numéro, vos commandes apparaîtront automatiquement."
              : "Order faster, keep your addresses and see your history. If you've ordered with this number before, those orders appear automatically."
            : fr
              ? "Entrez le numéro WhatsApp de vos commandes et votre code."
              : "Enter the WhatsApp number you order with and your PIN."}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        {isSignup && (
          <div>
            <label className={labelCls}>{fr ? "Nom complet" : "Full name"}</label>
            <input
              className={inputCls}
              autoComplete="name"
              placeholder={fr ? "Votre nom" : "Your name"}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
        )}

        <div>
          <label className={labelCls}>{fr ? "Numéro WhatsApp" : "WhatsApp number"}</label>
          <input
            className={inputCls}
            inputMode="tel"
            autoComplete="tel"
            placeholder="+237 6XX XXX XXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>
            {isSignup ? (fr ? "Choisissez un code (4–6 chiffres)" : "Choose a PIN (4–6 digits)") : (fr ? "Votre code" : "Your PIN")}
          </label>
          <input
            className={inputCls}
            inputMode="numeric"
            autoComplete={isSignup ? "new-password" : "current-password"}
            type="password"
            maxLength={6}
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </div>

        {isSignup && (
          <div>
            <label className={labelCls}>{fr ? "Confirmez le code" : "Confirm your PIN"}</label>
            <input
              className={inputCls}
              inputMode="numeric"
              autoComplete="new-password"
              type="password"
              maxLength={6}
              placeholder="••••"
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        )}

        {error && (
          <p className="rounded-xl bg-restricted/10 px-3 py-2 text-xs text-restricted">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending || phone.trim().length < 8 || pin.length < 4 || (isSignup && fullName.trim().length < 2)}
          className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-gold-400 px-4 py-3 font-display text-sm font-bold text-ink-950 transition-opacity disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isSignup ? (
            <UserPlus className="h-4 w-4" />
          ) : (
            <LogIn className="h-4 w-4" />
          )}
          {isSignup ? (fr ? "Créer mon compte" : "Create account") : (fr ? "Se connecter" : "Log in")}
        </button>
      </form>

      {/* The PIN must never be confused with a mobile-money PIN. */}
      <p className="flex items-start gap-2 rounded-xl border border-ink-700 bg-ink-900/60 p-3 text-[11px] leading-relaxed text-mist-400">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-safe" />
        {fr
          ? "Ce code sert uniquement à vous connecter à Urban Night Lift. Nous ne demandons JAMAIS votre code MTN MoMo ou Orange Money."
          : "This PIN is only for logging in to Urban Night Lift. We will NEVER ask for your MTN MoMo or Orange Money PIN."}
      </p>

      <p className="text-center text-xs text-mist-400">
        {isSignup ? (
          <>
            {fr ? "Vous avez déjà un compte ? " : "Already have an account? "}
            <Link href="/account/login" className="font-semibold text-violet-300 hover:text-violet-200">
              {fr ? "Se connecter" : "Log in"}
            </Link>
          </>
        ) : (
          <>
            {fr ? "Pas encore de compte ? " : "No account yet? "}
            <Link href="/account/signup" className="font-semibold text-violet-300 hover:text-violet-200">
              {fr ? "Créer un compte" : "Create one"}
            </Link>
          </>
        )}
      </p>

      <p className="text-center text-xs text-mist-500">
        {fr ? "Vous pouvez aussi commander sans compte." : "You can also order without an account."}{" "}
        <Link href="/order" className="text-mist-300 underline">
          {fr ? "Commander" : "Order now"}
        </Link>
      </p>
    </div>
  );
}
