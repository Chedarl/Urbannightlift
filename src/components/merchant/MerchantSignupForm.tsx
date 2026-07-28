"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Store, Phone, MapPin, Clock, Link2, ImageUp, Plus, Trash2, Check, ShieldCheck, Moon,
} from "lucide-react";

import { useTranslation } from "@/lib/i18n";
import { LocationField } from "@/components/customer/location/LocationField";
import { Logo } from "@/components/shared/Logo";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import type { SelectedLocation } from "@/lib/locations/types";
import { cn } from "@/lib/utils";
import type { MerchantCategory } from "@prisma/client";

/**
 * A business adds itself to Urban Night Lift.
 *
 * The catalogue's first attempt was filled from a public map and turned out to
 * be mostly places that had closed. Nothing we can read from outside tells us
 * whether a shop is still trading — the platforms that would know refuse to be
 * queried. But a merchant who fills this in is trading tonight, wants the
 * orders, and has just given us their own hours, prices and logo, which is
 * better data than any list we could assemble about them.
 *
 * So it has to be short enough to finish on a phone between customers.
 */

const ACCENT = "#d4af37";
const card = "rounded-2xl border border-ink-700 bg-ink-900/50 p-4";
const label = "flex items-center gap-1.5 text-xs font-medium text-mist-400";
const input =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-gold-400 focus:outline-none";

const CATEGORIES: { value: MerchantCategory; en: string; fr: string }[] = [
  { value: "FOOD", en: "Restaurant / food", fr: "Restaurant / nourriture" },
  { value: "GROCERY", en: "Supermarket / grocery", fr: "Supermarché / alimentation" },
  { value: "PHARMACY", en: "Pharmacy", fr: "Pharmacie" },
  { value: "GENERAL_STORE", en: "Shop", fr: "Boutique" },
  { value: "OTHER", en: "Something else", fr: "Autre" },
];

interface Item { name: string; priceXaf: string }

export function MerchantSignupForm() {
  const { locale } = useTranslation();
  const fr = locale === "fr";

  const [merchantName, setMerchantName] = useState("");
  const [category, setCategory] = useState<MerchantCategory>("FOOD");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [socialUrl, setSocialUrl] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [nightOpen, setNightOpen] = useState(true);
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<Item[]>([{ name: "", priceXaf: "" }]);
  const [accepted, setAccepted] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "merchant-logos", fileName: file.name, orderCode: "logo" }),
      });
      const { signedUrl, path, error: upErr } = await res.json();
      if (!signedUrl) throw new Error(upErr ?? "upload failed");
      const put = await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) throw new Error("upload failed");
      setLogoUrl(path);
      setLogoName(file.name);
    } catch {
      setError(fr ? "Le logo n'a pas pu être envoyé. Réessayez." : "The logo couldn't be uploaded. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (merchantName.trim().length < 2) {
      setError(fr ? "Indiquez le nom de votre commerce." : "Tell us the name of your business.");
      return;
    }
    if (whatsappNumber.replace(/\D/g, "").length < 9) {
      setError(fr ? "Un numéro WhatsApp valide est nécessaire." : "A valid WhatsApp number is needed.");
      return;
    }
    if (!accepted) {
      setError(fr ? "Confirmez que vous représentez ce commerce." : "Please confirm you represent this business.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/merchant-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantName: merchantName.trim(),
          category,
          whatsappNumber: whatsappNumber.trim(),
          socialUrl: socialUrl.trim() || null,
          openingHours: openingHours.trim() || null,
          nightOpen,
          logoUrl,
          address: location ? `${location.primaryName}${location.neighbourhood ? `, ${location.neighbourhood}` : ""}` : null,
          neighbourhood: location?.neighbourhood ?? null,
          landmark: location?.landmark ?? null,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          products: items
            .filter((i) => i.name.trim())
            .map((i) => ({ name: i.name.trim(), priceXaf: Number(i.priceXaf) || null })),
          acceptedTerms: true,
          companyWebsite: honeypot,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error && err.message !== "failed"
          ? err.message
          : fr
            ? "Envoi impossible. Vérifiez votre connexion."
            : "Couldn't send that. Check your connection."
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-safe/15 text-safe">
          <Check className="h-8 w-8" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-bold">
          {fr ? "Merci — nous avons vos informations." : "Thank you — we have your details."}
        </h1>
        <p className="mt-3 text-sm text-mist-400">
          {fr
            ? "Nous vous appelons sur WhatsApp pour confirmer, puis votre commerce apparaît aux clients qui commandent la nuit."
            : "We'll message you on WhatsApp to confirm, then your business appears to customers ordering at night."}
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-gold-300">
          {fr ? "Retour à l'accueil" : "Back to the home page"}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl pb-16">
      <div className="flex items-center justify-between px-4 py-3">
        <Logo height={30} />
        <LanguageSwitch />
      </div>

      <div className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-b from-gold-400/20 via-gold-500/5 to-transparent px-5 pb-7 pt-4">
        <h1 className="font-display text-2xl font-bold leading-tight">
          {fr ? "Vendez avec Urban Night Lift" : "Sell with Urban Night Lift"}
        </h1>
        <p className="mt-2 text-sm text-mist-300">
          {fr
            ? "Nous livrons à Yaoundé de 18h à 4h. Ajoutez votre commerce et les clients pourront commander chez vous la nuit — sans frais pour vous."
            : "We deliver across Yaoundé from 6 PM to 4 AM. Add your business and customers can order from you at night — at no cost to you."}
        </p>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-5">
        <div className={card}>
          <p className={label}>
            <Store className="h-3.5 w-3.5 text-gold-300" /> {fr ? "Nom du commerce" : "Business name"}
          </p>
          <input
            className={cn(input, "mt-2")}
            value={merchantName}
            onChange={(e) => setMerchantName(e.target.value)}
            placeholder={fr ? "ex. Chez Maman Grillades" : "e.g. Mama's Grill House"}
          />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
                  category === c.value
                    ? "border-gold-400 bg-gold-400/10 text-gold-200"
                    : "border-ink-700 bg-ink-800 text-mist-400"
                )}
              >
                {fr ? c.fr : c.en}
              </button>
            ))}
          </div>
        </div>

        <div className={card}>
          <p className={label}>
            <Phone className="h-3.5 w-3.5 text-gold-300" /> {fr ? "Numéro WhatsApp" : "WhatsApp number"}
          </p>
          <p className="mt-1 text-[11px] text-mist-500">
            {fr ? "C'est ici que nous envoyons les commandes." : "This is where we send you orders."}
          </p>
          <div className="mt-2 flex">
            <span className="flex shrink-0 items-center gap-1 rounded-l-xl border border-r-0 border-ink-700 bg-ink-800 px-2.5 text-sm text-mist-300">
              🇨🇲 +237
            </span>
            <input
              className={cn(input, "rounded-l-none")}
              inputMode="tel"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="6 90 12 34 56"
            />
          </div>
        </div>

        <div className={card}>
          <p className={cn(label, "mb-2")}>
            <MapPin className="h-3.5 w-3.5 text-gold-300" /> {fr ? "Où vous trouver" : "Where to find you"}
          </p>
          <LocationField
            mode="pickup"
            label={fr ? "Adresse du commerce" : "Business location"}
            accent={ACCENT}
            value={location}
            onChange={setLocation}
          />
          <p className="mt-2 text-[11px] text-mist-500">
            {fr
              ? "Le livreur va exactement à ce point — épinglez la porte, pas la rue."
              : "The rider goes exactly to this point — pin the door, not the street."}
          </p>
        </div>

        <div className={card}>
          <p className={label}>
            <Clock className="h-3.5 w-3.5 text-gold-300" /> {fr ? "Vos horaires" : "Your hours"}
          </p>
          <input
            className={cn(input, "mt-2")}
            value={openingHours}
            onChange={(e) => setOpeningHours(e.target.value)}
            placeholder={fr ? "ex. 10h – 23h tous les jours" : "e.g. 10 AM – 11 PM daily"}
          />
          <button
            type="button"
            onClick={() => setNightOpen((v) => !v)}
            className={cn(
              "mt-3 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm",
              nightOpen ? "border-gold-400 bg-gold-400/10 text-gold-200" : "border-ink-700 bg-ink-800 text-mist-400"
            )}
          >
            <span className="flex items-center gap-2">
              <Moon className="h-4 w-4" />
              {fr ? "Ouvert le soir / la nuit" : "Open in the evening / at night"}
            </span>
            <span
              className={cn(
                "h-5 w-9 rounded-full p-0.5 transition-colors",
                nightOpen ? "bg-gold-400" : "bg-ink-600"
              )}
            >
              <span
                className={cn(
                  "block h-4 w-4 rounded-full bg-ink-950 transition-transform",
                  nightOpen && "translate-x-4"
                )}
              />
            </span>
          </button>
        </div>

        <div className={card}>
          <p className={label}>
            <Link2 className="h-3.5 w-3.5 text-gold-300" />
            {fr ? "Votre page Facebook, Instagram ou TikTok" : "Your Facebook, Instagram or TikTok page"}
          </p>
          <p className="mt-1 text-[11px] text-mist-500">
            {fr ? "Facultatif — cela nous aide à vous reconnaître." : "Optional — it helps us recognize you."}
          </p>
          <input
            className={cn(input, "mt-2")}
            value={socialUrl}
            onChange={(e) => setSocialUrl(e.target.value)}
            placeholder="instagram.com/…"
          />
        </div>

        <div className={card}>
          <p className={label}>
            <ImageUp className="h-3.5 w-3.5 text-gold-300" /> {fr ? "Votre logo" : "Your logo"}
          </p>
          <p className="mt-1 text-[11px] text-mist-500">
            {fr
              ? "Les clients vous reconnaissent plus vite avec votre logo. Facultatif."
              : "Customers recognize you faster with your logo. Optional."}
          </p>
          <label
            className={cn(
              "mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-ink-700 bg-ink-800 px-3 py-3 text-sm",
              logoName ? "text-safe" : "text-mist-500"
            )}
          >
            <ImageUp className="h-5 w-5" />
            {uploading
              ? fr ? "Envoi…" : "Uploading…"
              : logoName ?? (fr ? "Choisir une image" : "Choose an image")}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogo} />
          </label>
        </div>

        <div className={card}>
          <p className={label}>
            <Plus className="h-3.5 w-3.5 text-gold-300" />
            {fr ? "Quelques articles et leurs prix" : "A few items and their prices"}
          </p>
          <p className="mt-1 text-[11px] text-mist-500">
            {fr
              ? "Facultatif, mais les clients commandent plus quand ils voient un prix."
              : "Optional, but customers order more when they can see a price."}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                <input
                  className={input}
                  value={it.name}
                  onChange={(e) =>
                    setItems((prev) => prev.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))
                  }
                  placeholder={fr ? "Poulet braisé" : "Grilled chicken"}
                />
                <input
                  className={input}
                  inputMode="numeric"
                  value={it.priceXaf}
                  onChange={(e) =>
                    setItems((prev) => prev.map((x, j) => (i === j ? { ...x, priceXaf: e.target.value } : x)))
                  }
                  placeholder="XAF"
                />
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                  className="p-1.5 text-mist-500 hover:text-restricted"
                  aria-label={fr ? "Retirer" : "Remove"}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {items.length < 5 && (
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, { name: "", priceXaf: "" }])}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gold-400/40 py-2.5 text-sm font-medium text-gold-300"
            >
              <Plus className="h-4 w-4" /> {fr ? "Ajouter un article" : "Add another item"}
            </button>
          )}
        </div>

        {/* Not shown to a person; a filled value means a bot. */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />

        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ink-700 bg-ink-900/50 p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ accentColor: ACCENT }}
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <span className="text-[11px] leading-relaxed text-mist-400">
            <ShieldCheck className="mr-1 inline h-3 w-3 text-gold-300" />
            {fr
              ? "Je représente ce commerce et j'autorise Urban Night Lift à afficher son nom, son logo et ses prix aux clients. Nous ne demandons jamais de code PIN MoMo ou Orange Money."
              : "I represent this business and allow Urban Night Lift to show its name, logo and prices to customers. We never ask for a MoMo or Orange Money PIN."}
          </span>
        </label>

        {error && (
          <p data-error="true" className="rounded-xl border border-restricted/40 bg-restricted/10 px-3 py-2 text-xs text-restricted">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || uploading}
          className="w-full rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 py-3.5 font-display text-base font-semibold text-ink-950 disabled:opacity-50"
        >
          {busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Rejoindre Urban Night Lift" : "Join Urban Night Lift"}
        </button>
        <p className="text-center text-[11px] text-mist-500">
          {fr
            ? "Nous vous contactons sur WhatsApp pour confirmer avant toute mise en ligne."
            : "We'll message you on WhatsApp to confirm before anything goes live."}
        </p>
      </div>
    </form>
  );
}
