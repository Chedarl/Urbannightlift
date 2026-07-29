"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, UserPlus, LogIn, Loader2 } from "lucide-react";
import { Logo } from "@/components/shared/Logo";
import { refreshProfile, useCustomerProfile } from "@/lib/account/profile";
import { cn } from "@/lib/utils";

/**
 * An account before any documents.
 *
 * Applying used to be one anonymous form that accepted ID card images from
 * whoever happened to open it — nothing tied a scan of somebody's national ID
 * to a person we could name or reach. Signing up first means every document
 * that lands in our storage already has a name, a WhatsApp number and a PIN
 * behind it, and that the applicant can come back to finish or correct what
 * they sent.
 *
 * It is the same Urban Night Lift account customers already use. Riders and
 * ambassadors are not given staff logins here — approval does that.
 */

const input =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:outline-none";

export function JoinGate({
  accent,
  title,
  blurb,
  fr,
  children,
}: {
  accent: string;
  /** What they are applying for, e.g. "Ride with us". */
  title: string;
  blurb: string;
  fr: boolean;
  /** The application form, shown only once they have an account. */
  children: React.ReactNode;
}) {
  const { profile, loaded } = useCustomerProfile();
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-mist-500" />
      </div>
    );
  }

  if (profile) return <>{children}</>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/account/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          whatsappNumber: phone,
          pin,
          preferredLanguage: fr ? "FR" : "EN",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(messageFor(data.error, data.minutesLeft, fr));
        return;
      }
      refreshProfile();
      // The form below appears in place — they keep going rather than being
      // bounced to an account page and losing the thread.
      router.refresh();
    } catch {
      setError(fr ? "Une erreur est survenue." : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-16 pt-6">
      <Logo height={30} className="mx-auto" />

      <div className="text-center">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-mist-400">{blurb}</p>
      </div>

      <div
        className="rounded-2xl border p-4 text-xs leading-relaxed"
        style={{ borderColor: `${accent}55`, backgroundColor: `${accent}14` }}
      >
        <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" style={{ color: accent }} />
        {fr
          ? "Créez d'abord votre compte. Nous demandons ensuite vos documents — et comme ils sont liés à votre compte, personne d'autre ne peut envoyer de pièce d'identité en votre nom."
          : "Create your account first. We ask for your documents after that — and because they are tied to your account, nobody else can send an ID in your name."}
      </div>

      <div className="flex gap-2">
        {(["signup", "login"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold",
              mode === m ? "text-ink-950" : "border-ink-700 bg-ink-800 text-mist-300"
            )}
            style={mode === m ? { backgroundColor: accent, borderColor: accent } : undefined}
          >
            {m === "signup" ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {m === "signup"
              ? fr
                ? "Créer un compte"
                : "Create account"
              : fr
                ? "J'ai déjà un compte"
                : "I have an account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === "signup" && (
          <div>
            <label className="mb-1 block text-xs text-mist-400">
              {fr ? "Votre nom complet" : "Your full name"}
            </label>
            <input
              className={input}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={fr ? "ex. Paul Mbarga" : "e.g. Paul Mbarga"}
              autoComplete="name"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-mist-400">
            {fr ? "Numéro WhatsApp" : "WhatsApp number"}
          </label>
          <div className="flex">
            <span className="flex shrink-0 items-center rounded-l-xl border border-r-0 border-ink-700 bg-ink-800 px-2.5 text-sm text-mist-300">
              🇨🇲 +237
            </span>
            <input
              className={cn(input, "rounded-l-none")}
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="6 90 12 34 56"
              autoComplete="tel"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-mist-400">
            {mode === "signup" ? (fr ? "Choisissez un PIN" : "Choose a PIN") : fr ? "Votre PIN" : "Your PIN"}
          </label>
          <input
            className={input}
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          <p className="mt-1 text-[11px] text-mist-500">
            {fr
              ? "4 à 6 chiffres. C'est un PIN Urban Night Lift — jamais votre PIN MoMo ou Orange."
              : "4–6 digits. This is an Urban Night Lift PIN — never your MoMo or Orange PIN."}
          </p>
        </div>

        {error && (
          <p className="rounded-xl border border-restricted/40 bg-restricted/10 px-3 py-2 text-xs text-restricted">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || phone.length < 8 || pin.length < 4 || (mode === "signup" && fullName.length < 2)}
          className="rounded-2xl py-3.5 font-display text-base font-bold text-ink-950 disabled:opacity-50"
          style={{ backgroundColor: accent }}
        >
          {busy
            ? fr
              ? "Un instant…"
              : "One moment…"
            : mode === "signup"
              ? fr
                ? "Créer mon compte et continuer"
                : "Create my account and continue"
              : fr
                ? "Se connecter et continuer"
                : "Sign in and continue"}
        </button>
      </form>

      <p className="text-center text-[11px] text-mist-500">
        {fr ? "Vous commandez déjà chez nous ? Utilisez le même numéro. " : "Already order with us? Use the same number. "}
        <Link href="/" className="text-gold-300 hover:text-gold-200">
          {fr ? "Retour à l'accueil" : "Back to home"}
        </Link>
      </p>
    </div>
  );
}

function messageFor(code: string | undefined, minutesLeft: number | undefined, fr: boolean): string {
  switch (code) {
    case "invalid_phone":
      return fr ? "Entrez un numéro WhatsApp valide." : "Enter a valid WhatsApp number.";
    case "invalid_pin":
      return fr ? "Le PIN doit contenir 4 à 6 chiffres." : "Your PIN must be 4 to 6 digits.";
    case "invalid_name":
      return fr ? "Entrez votre nom complet." : "Enter your full name.";
    case "account_exists":
      return fr
        ? "Un compte existe déjà pour ce numéro — connectez-vous."
        : "An account already exists for this number — sign in instead.";
    case "locked":
      return fr
        ? `Trop de tentatives. Réessayez dans ${minutesLeft} minutes.`
        : `Too many attempts. Try again in ${minutesLeft} minutes.`;
    default:
      return fr ? "Numéro ou PIN incorrect." : "That number and PIN don't match.";
  }
}
