"use client";

import { useState } from "react";
import Link from "next/link";
import { Bike, IdCard, Camera, MapPin, Clock, ShieldCheck, Check, Upload, Loader2 } from "lucide-react";
import { uploadFile } from "@/lib/uploads/client";
import { useCustomerProfile } from "@/lib/account/profile";
import { cn } from "@/lib/utils";

/**
 * Applying to ride for us.
 *
 * Deliberately a different shape from the ambassador form: this is a job, and
 * the things that decide it are identity, a working bike, and which nights
 * somebody can actually work. We ask for an ID because a stranger is going to
 * knock on a customer's door at 1 AM — and we say so on the form, because
 * asking for an ID card without explaining why is how you get fake ones.
 *
 * Nothing here creates a login. A staff account exists only after a human has
 * looked at the ID and approved the application.
 */

const input =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-400 focus:outline-none";
const label = "text-xs font-medium text-mist-400";
const card = "rounded-2xl border border-ink-700 bg-ink-900/50 p-4";

const VEHICLES = [
  { v: "MOTORCYCLE", en: "Motorcycle", fr: "Moto" },
  { v: "SCOOTER", en: "Scooter", fr: "Scooter" },
  { v: "BICYCLE", en: "Bicycle", fr: "Vélo" },
  { v: "CAR", en: "Car", fr: "Voiture" },
];

export function RiderJoinForm({ zones, fr }: { zones: { id: string; zoneName: string }[]; fr: boolean }) {
  // They signed up before reaching this form, so their name and number are
  // already known — the account is the identity, not anything retyped here.
  const { profile } = useCustomerProfile();
  const [f, setF] = useState({
    fullName: "",
    whatsappNumber: "",
    phone: "",
    email: "",
    neighbourhood: "",
    idCardNumber: "",
    vehicleType: "MOTORCYCLE",
    vehicleRef: "",
    availability: "",
    yearsExperience: "",
    knowsCity: "",
    companyWebsite: "", // honeypot
  });
  const [zonePreference, setZonePreference] = useState<string[]>([]);
  const [hasLicence, setHasLicence] = useState(false);
  const [ownsVehicle, setOwnsVehicle] = useState(true);
  const [files, setFiles] = useState<{ photoUrl?: string; idCardFrontUrl?: string; idCardBackUrl?: string }>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function pick(kind: "photoUrl" | "idCardFrontUrl" | "idCardBackUrl", file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError(fr ? "Fichier trop lourd (max 10 Mo)." : "That file is too big (10 MB max).");
      return;
    }
    setError(null);
    setUploading(kind);
    try {
      // The face photo is customer-facing by design; the ID card never is, so
      // they go to different buckets rather than relying on anyone remembering.
      const bucket = kind === "photoUrl" ? "rider-photos" : "rider-documents";
      const path = await uploadFile(file, bucket, "rider");
      setFiles((p) => ({ ...p, [kind]: path }));
    } catch {
      setError(fr ? "L'envoi a échoué. Réessayez." : "That upload failed. Try again.");
    } finally {
      setUploading(null);
    }
  }

  function toggleZone(id: string) {
    setZonePreference((p) => (p.includes(id) ? p.filter((z) => z !== id) : [...p, id]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/rider-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          ...files,
          zonePreference,
          hasLicence,
          ownsVehicle,
          acceptedTerms: accepted,
        }),
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
          {fr ? "Demande reçue" : "Application received"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-mist-400">
          {fr
            ? "Nous vérifions votre pièce d'identité et vous appelons sur WhatsApp. Vous recevrez votre accès conducteur seulement une fois approuvé."
            : "We'll check your ID and call you on WhatsApp. Your rider login is created only once you're approved — nobody gets access before we've met you."}
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-gold-400 px-6 py-3 font-display font-bold text-ink-950"
        >
          {fr ? "Retour à l'accueil" : "Back to home"}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-16 pt-4">
      <div className="rounded-b-[2rem] bg-gradient-to-b from-violet-500/25 via-ink-900/10 to-transparent px-1 pb-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
          <Bike className="h-7 w-7" />
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold leading-tight">
          {fr ? "Rouler avec nous" : "Ride with us"}
        </h1>
        <p className="mt-1 text-sm text-mist-300">
          {fr
            ? "Travail de nuit, 18h à 4h, à Yaoundé. Vous gardez 60% de chaque course."
            : "Night work, 6 PM to 4 AM, in Yaoundé. You keep 60% of every delivery fee."}
        </p>
      </div>

      {/* Who you are */}
      <div className={card}>
        <label className={label}>{fr ? "Nom complet (comme sur la pièce d'identité)" : "Full name (as on your ID)"}</label>
        <input
          className={cn(input, "mt-1.5")}
          value={f.fullName || profile?.fullName || ""}
          onChange={(e) => set("fullName", e.target.value)}
          placeholder={fr ? "ex. Paul Mbarga" : "e.g. Paul Mbarga"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={card}>
          <label className={label}>{fr ? "Numéro WhatsApp" : "WhatsApp number"}</label>
          <p className="mt-1.5 rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2.5 text-sm text-mist-200">
            {profile ? `+${profile.whatsappNumber}` : "—"}
          </p>
          <p className="mt-1 text-xs text-mist-500">
            {fr ? "Le numéro de votre compte — c'est là que nous appelons." : "The number on your account — this is where we call."}
          </p>
        </div>
        <div className={card}>
          <label className={label}>{fr ? "Quartier où vous habitez" : "Neighbourhood you live in"}</label>
          <input
            className={cn(input, "mt-1.5")}
            value={f.neighbourhood}
            onChange={(e) => set("neighbourhood", e.target.value)}
            placeholder={fr ? "ex. Biyem-Assi" : "e.g. Biyem-Assi"}
          />
        </div>
      </div>

      {/* Identity */}
      <div className={cn(card, "border-violet-500/30")}>
        <p className={cn(label, "flex items-center gap-1.5")}>
          <IdCard className="h-3.5 w-3.5 text-violet-300" />
          {fr ? "Pièce d'identité" : "Your ID"}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-mist-500">
          {fr
            ? "Nous vérifions chaque conducteur parce qu'il frappe à la porte des clients à 1h du matin. Votre pièce reste privée : elle n'est jamais montrée à un client ni publiée."
            : "We check every rider because you'll be knocking on someone's door at 1 AM. Your ID stays private — it is never shown to a customer and never published anywhere."}
        </p>

        <input
          className={cn(input, "mt-3")}
          value={f.idCardNumber}
          onChange={(e) => set("idCardNumber", e.target.value)}
          placeholder={fr ? "Numéro de la CNI" : "ID card number"}
        />

        <div className="mt-2 grid grid-cols-2 gap-2">
          <FileButton
            label={fr ? "Recto" : "Front"}
            done={!!files.idCardFrontUrl}
            busy={uploading === "idCardFrontUrl"}
            onPick={(file) => pick("idCardFrontUrl", file)}
          />
          <FileButton
            label={fr ? "Verso" : "Back"}
            done={!!files.idCardBackUrl}
            busy={uploading === "idCardBackUrl"}
            onPick={(file) => pick("idCardBackUrl", file)}
          />
        </div>
      </div>

      {/* Face photo — the one image customers do see */}
      <div className={card}>
        <p className={cn(label, "flex items-center gap-1.5")}>
          <Camera className="h-3.5 w-3.5 text-violet-300" />
          {fr ? "Votre photo" : "A photo of you"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-mist-500">
          {fr
            ? "Celle-ci, les clients la voient : ils savent qui arrive avant que vous frappiez. Visage dégagé, bonne lumière."
            : "This one customers do see — so they know who's arriving before you knock. Face clear, good light."}
        </p>
        <div className="mt-2">
          <FileButton
            label={fr ? "Choisir une photo" : "Choose a photo"}
            done={!!files.photoUrl}
            busy={uploading === "photoUrl"}
            onPick={(file) => pick("photoUrl", file)}
          />
        </div>
      </div>

      {/* The bike */}
      <div className={card}>
        <p className={cn(label, "flex items-center gap-1.5")}>
          <Bike className="h-3.5 w-3.5 text-violet-300" /> {fr ? "Votre engin" : "What you ride"}
        </p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {VEHICLES.map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => set("vehicleType", o.v)}
              className={cn(
                "rounded-xl border px-2 py-2 text-xs font-semibold",
                f.vehicleType === o.v
                  ? "border-violet-400 bg-violet-500/10 text-violet-200"
                  : "border-ink-700 bg-ink-800 text-mist-300"
              )}
            >
              {fr ? o.fr : o.en}
            </button>
          ))}
        </div>
        <input
          className={cn(input, "mt-2")}
          value={f.vehicleRef}
          onChange={(e) => set("vehicleRef", e.target.value)}
          placeholder={fr ? "Marque et plaque — ex. Yamaha rouge, CE 4521 AB" : "Make and plate — e.g. red Yamaha, CE 4521 AB"}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Toggle on={hasLicence} onClick={() => setHasLicence((v) => !v)} text={fr ? "J'ai un permis" : "I have a licence"} />
          <Toggle on={ownsVehicle} onClick={() => setOwnsVehicle((v) => !v)} text={fr ? "L'engin est à moi" : "It's my own"} />
        </div>
      </div>

      {/* Where and when */}
      <div className={card}>
        <p className={cn(label, "flex items-center gap-1.5")}>
          <MapPin className="h-3.5 w-3.5 text-violet-300" />
          {fr ? "Zones que vous connaissez bien" : "Zones you know well"}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {zones.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => toggleZone(z.id)}
              className={cn(
                "rounded-xl border px-2.5 py-1.5 text-xs",
                zonePreference.includes(z.id)
                  ? "border-violet-400 bg-violet-500/10 text-violet-200"
                  : "border-ink-700 bg-ink-800 text-mist-400"
              )}
            >
              {z.zoneName}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-mist-500">
          {fr
            ? "Trouver un lieu, c'est le métier ici. Nous gardons les conducteurs dans les zones qu'ils connaissent."
            : "Finding a place is the job here. We keep riders in the areas they already know."}
        </p>
      </div>

      <div className={card}>
        <p className={cn(label, "flex items-center gap-1.5")}>
          <Clock className="h-3.5 w-3.5 text-violet-300" />
          {fr ? "Quelles nuits pouvez-vous travailler ?" : "Which nights can you work?"}
        </p>
        <textarea
          className={cn(input, "mt-1.5 min-h-16 resize-y")}
          maxLength={300}
          value={f.availability}
          onChange={(e) => set("availability", e.target.value)}
          placeholder={
            fr ? "ex. tous les soirs sauf dimanche, à partir de 19h" : "e.g. every night except Sunday, from 7 PM"
          }
        />
        <input
          className={cn(input, "mt-2")}
          type="number"
          min={0}
          max={50}
          inputMode="numeric"
          value={f.yearsExperience}
          onChange={(e) => set("yearsExperience", e.target.value)}
          placeholder={fr ? "Années d'expérience de conduite" : "Years of riding experience"}
        />
      </div>

      {/* Honeypot */}
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
          className="mt-0.5 h-4 w-4 shrink-0 accent-violet-400"
        />
        <span className="text-xs leading-relaxed text-mist-300">
          {fr
            ? "Je confirme que ces informations sont exactes et que la pièce d'identité est la mienne. J'autorise Urban Night Lift à la vérifier."
            : "I confirm these details are true and the ID is mine. I allow Urban Night Lift to check it."}
        </span>
      </label>

      {error && (
        <p className="rounded-xl border border-restricted/40 bg-restricted/10 px-3 py-2 text-xs text-restricted">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !accepted || (f.fullName || profile?.fullName || "").length < 3}
        className="rounded-2xl bg-violet-500 py-3.5 font-display text-base font-bold text-mist-100 disabled:opacity-50"
      >
        {busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Envoyer ma candidature" : "Send my application"}
      </button>

      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-mist-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-safe" />
        {fr
          ? "Nous ne demandons jamais d'argent pour postuler, et jamais votre code secret MoMo ou Orange."
          : "We never charge anything to apply, and we will never ask for your MoMo PIN or Orange secret code."}
      </p>

      <p className="text-center text-xs text-mist-500">
        {fr ? "Déjà conducteur ? " : "Already riding with us? "}
        <Link href="/rider/login" className="text-gold-300 hover:text-gold-200">
          {fr ? "Connectez-vous" : "Sign in"}
        </Link>
      </p>
    </form>
  );
}

function FileButton({
  label,
  done,
  busy,
  onPick,
}: {
  label: string;
  done: boolean;
  busy: boolean;
  onPick: (file: File | undefined) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-2.5 text-xs",
        done ? "border-safe/50 text-safe" : "border-ink-600 text-mist-400"
      )}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : done ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Upload className="h-3.5 w-3.5" />
      )}
      {done ? "Uploaded" : label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
    </label>
  );
}

function Toggle({ on, onClick, text }: { on: boolean; onClick: () => void; text: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs",
        on ? "border-violet-400 bg-violet-500/10 text-violet-200" : "border-ink-700 bg-ink-800 text-mist-400"
      )}
    >
      {text}
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          on ? "bg-violet-400" : "bg-ink-700"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
            on ? "left-[18px]" : "left-0.5"
          )}
        />
      </span>
    </button>
  );
}
