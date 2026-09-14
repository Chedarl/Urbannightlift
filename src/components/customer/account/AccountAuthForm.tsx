"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, ShieldCheck, UserPlus, LogIn, Moon } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { refreshProfile } from "@/lib/account/profile";
import { Logo } from "@/components/shared/Logo";
import { cn } from "@/lib/utils";

/**
 * Where to land after signing in. Only ever an internal path — a `next` that
 * points off-site is ignored, so the redirect can never be turned into an
 * open-redirect out of the portal.
 */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/account";
}

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
  const next = safeNext(useSearchParams().get("next"));
  const isSignup = mode === "signup";
  const q = next === "/account" ? "" : `?next=${encodeURIComponent(next)}`;

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
      // A new account lands on its welcome; a returning customer goes straight
      // where they were headed. Only added when `next` is the portal itself, so
      // somebody signing up mid-order is still delivered back to their order.
      router.push(isSignup && next === "/account" ? "/account?welcome=1" : next);
      router.refresh();
    } catch {
      setError(fr ? "Une erreur est survenue." : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  const canSubmit =
    !pending && phone.trim().length >= 8 && pin.length >= 4 && (!isSignup || fullName.trim().length >= 2);

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-16 pt-4">
      {/* The night, behind everything — the same aurora the portal opens with,
          so signing in already feels like the app you are about to be inside. */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-96 bg-gradient-to-b from-violet-700/25 via-violet-900/8 to-transparent blur-3xl" />

      <Link href="/" className="inline-flex w-fit items-center gap-1.5 text-sm text-mist-400 hover:text-mist-200">
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      {/* Brand hero — logo, a night line, a moon. Small, but it makes the door
          feel like part of the product rather than a bare form. */}
      <div className="animate-rise-in mt-6 flex flex-col items-center text-center">
        <Logo className="h-9 w-auto" />
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-violet-300">
          <Moon className="h-3.5 w-3.5" /> {fr ? "Yaoundé · 18h – 4h" : "Yaoundé · 6 PM – 4 AM"}
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-mist-100">
          {isSignup ? (fr ? "Rejoignez la nuit" : "Join the night") : (fr ? "Bon retour" : "Welcome back")}
        </h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-mist-400">
          {isSignup
            ? fr
              ? "Un compte, et tout se passe dans votre espace : commandes, adresses, suivi en direct."
              : "One account, and it all happens in your space: orders, addresses, live tracking."
            : fr
              ? "Entrez le numéro WhatsApp de vos commandes et votre code."
              : "Enter the WhatsApp number you order with and your PIN."}
        </p>
      </div>

      <form
        onSubmit={submit}
        className="animate-rise-in mt-7 flex flex-col gap-3 rounded-3xl border border-ink-700/80 bg-ink-900/70 p-5 backdrop-blur"
        style={{ animationDelay: "0.06s" }}
      >
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
          {/* A fixed +237 chip, the way a ride app frames the local number —
              one less thing to type, one less way to get it wrong. */}
          <div className="flex items-stretch overflow-hidden rounded-xl border border-ink-700 bg-ink-800 focus-within:border-violet-500">
            <span className="flex items-center border-r border-ink-700 bg-ink-950/40 px-3 text-sm font-semibold text-mist-300">
              +237
            </span>
            <input
              className="w-full bg-transparent px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:outline-none"
              inputMode="tel"
              autoComplete="tel"
              placeholder="6XX XXX XXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>
            {isSignup ? (fr ? "Choisissez un code (4–6 chiffres)" : "Choose a PIN (4–6 digits)") : (fr ? "Votre code" : "Your PIN")}
          </label>
          <input
            className={cn(inputCls, "text-center text-lg tracking-[0.5em]")}
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
              className={cn(inputCls, "text-center text-lg tracking-[0.5em]")}
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
          disabled={!canSubmit}
          className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-gold-400 px-4 py-3.5 font-display text-sm font-bold text-ink-950 transition-all hover:bg-gold-300 disabled:opacity-50"
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

        {/* The PIN must never be confused with a mobile-money PIN. */}
        <p className="mt-1 flex items-start gap-2 text-xs leading-relaxed text-mist-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-safe" />
          {fr
            ? "Ce code sert uniquement à Urban Night Lift. Nous ne demandons JAMAIS votre code MoMo ou Orange Money."
            : "This PIN is only for Urban Night Lift. We NEVER ask for your MoMo or Orange Money PIN."}
        </p>
      </form>

      <p className="animate-rise-in mt-5 text-center text-xs text-mist-400" style={{ animationDelay: "0.12s" }}>
        {isSignup ? (
          <>
            {fr ? "Vous avez déjà un compte ? " : "Already have an account? "}
            <Link href={`/account/login${q}`} className="font-semibold text-violet-300 hover:text-violet-200">
              {fr ? "Se connecter" : "Log in"}
            </Link>
          </>
        ) : (
          <>
            {fr ? "Pas encore de compte ? " : "No account yet? "}
            <Link href={`/account/signup${q}`} className="font-semibold text-violet-300 hover:text-violet-200">
              {fr ? "Créer un compte" : "Create one"}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
