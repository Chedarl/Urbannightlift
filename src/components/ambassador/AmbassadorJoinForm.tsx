"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Megaphone, Wallet, ShieldCheck, Check, Sparkles } from "lucide-react";
import { formatXaf, cn } from "@/lib/utils";

/**
 * Applying to be an ambassador.
 *
 * Short on purpose. This is not a job application — it is somebody with a
 * following saying "give me a code". The only things we genuinely need are how
 * to reach them, the code they want, where the money goes, and a PIN so they
 * can watch their own earnings without asking us.
 */

const input =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-gold-400 focus:outline-none";
const label = "text-xs font-medium text-mist-400";
const card = "rounded-2xl border border-ink-700 bg-ink-900/50 p-4";

export function AmbassadorJoinForm({
  terms,
  fr,
}: {
  terms: { discountXaf: number; commissionPercent: number; orderCap: number };
  fr: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    code: "",
    payoutMethod: "MTN_MOMO",
    payoutNumber: "",
    reach: "",
    companyWebsite: "", // honeypot
  });
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/ambassador-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, acceptedTerms: accepted }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? (fr ? "Une erreur est survenue." : "Something went wrong."));
        return;
      }
      setDone(true);
    } catch {
      setError(fr ? "Une erreur est survenue." : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-safe/15 text-safe">
          <Check className="h-7 w-7" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold">
          {fr ? "Demande reçue" : "We've got it"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-mist-400">
          {fr
            ? `Nous vérifions chaque ambassadeur avant d'activer un code. Nous vous écrirons sur WhatsApp. Votre code ${f.code} ne rapporte rien tant qu'il n'est pas activé.`
            : `We check every ambassador before switching a code on. We'll message you on WhatsApp. Your code ${f.code} earns nothing until it's approved — please don't share it yet.`}
        </p>
        <button
          type="button"
          onClick={() => router.push("/ambassador/login")}
          className="mt-6 rounded-xl bg-gold-400 px-6 py-3 font-display font-bold text-ink-950"
        >
          {fr ? "Aller à ma page" : "Go to my sign-in"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-16 pt-4">
      <div className="rounded-b-[2rem] bg-gradient-to-b from-violet-500/25 via-violet-600/10 to-transparent px-1 pb-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
          <Megaphone className="h-7 w-7" />
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold leading-tight">
          {fr ? "Devenez ambassadeur" : "Become an ambassador"}
        </h1>
        <p className="mt-1 text-sm text-mist-300">
          {fr
            ? "Vous connaissez du monde. Nous payons pour cela."
            : "You know people. We'd rather pay you than pay for adverts."}
        </p>
      </div>

      <div className="rounded-2xl border border-violet-500/30 bg-violet-950/30 p-4 text-xs leading-relaxed text-violet-100">
        <Sparkles className="mr-1.5 inline h-3.5 w-3.5" />
        {fr ? (
          <>
            Toute personne utilisant votre code économise{" "}
            <span className="font-semibold">{formatXaf(terms.discountXaf)}</span> sur sa première
            commande. Vous gagnez{" "}
            <span className="font-semibold">{terms.commissionPercent}% de notre part</span> sur
            chacune de ses <span className="font-semibold">{terms.orderCap}</span> premières
            livraisons — payé chaque semaine par MoMo ou Orange.
          </>
        ) : (
          <>
            Anyone using your code saves{" "}
            <span className="font-semibold">{formatXaf(terms.discountXaf)}</span> on their first
            order. You earn{" "}
            <span className="font-semibold">{terms.commissionPercent}% of our share</span> on each of
            their first <span className="font-semibold">{terms.orderCap}</span> deliveries — paid
            weekly by MoMo or Orange. It comes out of our margin, never out of the rider&apos;s pay.
          </>
        )}
      </div>

      <div className={card}>
        <label className={label}>{fr ? "Le code que vous voulez" : "The code you want"}</label>
        <input
          className={cn(input, "mt-1.5 uppercase tracking-wide")}
          value={f.code}
          onChange={(e) => set("code", e.target.value.toUpperCase())}
          placeholder="MARIE"
          autoCapitalize="characters"
          maxLength={20}
        />
        <p className="mt-1 text-[11px] text-mist-500">
          {fr
            ? "Lettres et chiffres, 4 à 20 caractères. Choisissez quelque chose de facile à dire à voix haute."
            : "Letters and numbers, 4–20 characters. Pick something easy to say out loud."}
        </p>
      </div>

      <div className={card}>
        <label className={cn(label, "flex items-center gap-1.5")}>
          <Wallet className="h-3.5 w-3.5 text-gold-300" />
          {fr ? "Où envoyer votre argent" : "Where we send your money"}
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { v: "MTN_MOMO", t: "MTN MoMo" },
            { v: "ORANGE_MONEY", t: "Orange Money" },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => set("payoutMethod", o.v)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-xs font-semibold",
                f.payoutMethod === o.v
                  ? "border-gold-400 bg-gold-400/10 text-gold-200"
                  : "border-ink-700 bg-ink-800 text-mist-300"
              )}
            >
              {o.t}
            </button>
          ))}
        </div>
        <input
          className={cn(input, "mt-2")}
          inputMode="tel"
          value={f.payoutNumber}
          onChange={(e) => set("payoutNumber", e.target.value)}
          placeholder={fr ? "Numéro de paiement" : "Payout number"}
        />
        <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-relaxed text-mist-500">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-safe" />
          {fr
            ? "Juste le numéro. Ne donnez jamais votre code secret MoMo ou Orange — nous ne le demanderons jamais."
            : "Just the number. Never give anyone your MoMo PIN or Orange secret code — we will never ask for it."}
        </p>
      </div>

      <div className={card}>
        <label className={label}>{fr ? "Comment allez-vous en parler ?" : "How will you spread the word?"}</label>
        <textarea
          className={cn(input, "mt-1.5 min-h-20 resize-y")}
          maxLength={500}
          value={f.reach}
          onChange={(e) => set("reach", e.target.value)}
          placeholder={
            fr
              ? "ex. je gère un groupe WhatsApp de 300 étudiants à Biyem-Assi"
              : "e.g. I run a 300-person student WhatsApp group in Biyem-Assi"
          }
        />
      </div>

      {/* Honeypot: invisible to people, irresistible to bots. */}
      <input
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0"
        value={f.companyWebsite}
        onChange={(e) => set("companyWebsite", e.target.value)}
      />

      <label className="flex items-start gap-2.5 rounded-2xl border border-ink-700 bg-ink-900/50 p-3.5">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-gold-400"
        />
        <span className="text-xs leading-relaxed text-mist-300">
          {fr
            ? "Je confirme que ces informations sont exactes. Je comprends que la commission n'est due que sur les livraisons terminées et payées, et que mon code doit être approuvé avant de fonctionner."
            : "I confirm these details are true. I understand commission is only earned on deliveries that completed and were paid for, and that my code must be approved before it works."}
        </span>
      </label>

      {error && (
        <p className="rounded-xl border border-restricted/40 bg-restricted/10 px-3 py-2 text-xs text-restricted">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !accepted || f.code.length < 4}
        className="rounded-2xl bg-gold-400 py-3.5 font-display text-base font-bold text-ink-950 disabled:opacity-50"
      >
        {busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Envoyer ma demande" : "Send my application"}
      </button>

      <p className="text-center text-xs text-mist-500">
        {fr ? "Déjà ambassadeur ? " : "Already an ambassador? "}
        <Link href="/ambassador/login" className="text-gold-300 hover:text-gold-200">
          {fr ? "Connectez-vous" : "Sign in"}
        </Link>
      </p>
    </form>
  );
}
