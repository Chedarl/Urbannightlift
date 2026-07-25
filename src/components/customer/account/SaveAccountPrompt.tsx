"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, Check, ShieldCheck } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const inputCls =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-500 focus:outline-none";

/**
 * Offered on the confirmation screen to a guest who just ordered: they've
 * already given their name and number, so claiming the account is one PIN away —
 * and it links every past order on that number to the new account.
 */
export function SaveAccountPrompt({
  fullName,
  whatsappNumber,
}: {
  fullName: string;
  whatsappNumber: string;
}) {
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/account/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          whatsappNumber,
          pin,
          preferredLanguage: fr ? "FR" : "EN",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "account_exists"
            ? fr
              ? "Un compte existe déjà pour ce numéro."
              : "An account already exists for this number."
            : fr
              ? "Le code doit contenir 4 à 6 chiffres."
              : "Your PIN must be 4 to 6 digits."
        );
        setState("idle");
        return;
      }
      setState("done");
      router.refresh();
    } catch {
      setError(fr ? "Une erreur est survenue." : "Something went wrong.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-safe/40 bg-safe/10 p-4">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-safe">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          {fr
            ? "Compte créé. Vos commandes sont désormais enregistrées."
            : "Account created. Your orders are saved from now on."}
        </p>
        <Link
          href="/account"
          className="mt-3 inline-flex rounded-xl bg-gold-400 px-4 py-2 text-sm font-semibold text-ink-950"
        >
          {fr ? "Voir mon compte" : "View my account"}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gold-400/40 bg-gold-400/[0.06] p-4">
      <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-gold-200">
        <UserPlus className="h-4 w-4" />
        {fr ? "Enregistrez vos informations" : "Save your details"}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-mist-300">
        {fr
          ? "Choisissez un code et retrouvez cette commande, votre historique et vos adresses à chaque visite."
          : "Set a PIN to keep this order, your history and your addresses for next time."}
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gold-400 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-gold-300"
        >
          <UserPlus className="h-4 w-4" /> {fr ? "Créer mon compte" : "Create my account"}
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <input
            className={inputCls}
            inputMode="numeric"
            type="password"
            maxLength={6}
            placeholder={fr ? "Choisissez un code (4–6 chiffres)" : "Choose a PIN (4–6 digits)"}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
          {error && <p className="text-xs text-restricted">{error}</p>}
          <button
            type="button"
            disabled={state === "sending" || pin.length < 4}
            onClick={submit}
            className="flex items-center justify-center gap-2 rounded-xl bg-gold-400 px-4 py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-50"
          >
            {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {fr ? "Enregistrer" : "Save my account"}
          </button>
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-mist-500">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-safe" />
            {fr
              ? "Code de connexion Urban Night Lift uniquement — jamais votre code MoMo ou Orange Money."
              : "An Urban Night Lift login PIN only — never your MoMo or Orange Money PIN."}
          </p>
        </div>
      )}
    </div>
  );
}
