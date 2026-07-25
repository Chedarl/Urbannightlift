"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, MessageCircle, ChevronDown, LifeBuoy, Send, CheckCircle2, ShieldCheck, Bike } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { buildWaLink, MAIN_WHATSAPP_NUMBER } from "@/lib/whatsapp/links";
import { Button } from "@/components/shared/Button";
import { cn } from "@/lib/utils";

const SUPPORT_EMAIL = "urbannighlift@gmail.com";
const PHONE_DISPLAY = "+237 680 038 004";

interface Faq { q: { en: string; fr: string }; a: { en: string; fr: string } }

const FAQS: Faq[] = [
  {
    q: { en: "How do I place an order?", fr: "Comment passer une commande ?" },
    a: {
      en: "Open the app, pick a service (food, medicine, grocery, parcel, urgent, errand or a verified merchant), fill in the details and your pickup & delivery locations, then review and confirm. You'll get an order code to track it.",
      fr: "Ouvrez l'application, choisissez un service (repas, médicaments, courses, colis, urgent, course ou commerçant vérifié), renseignez les détails et vos lieux de ramassage et de livraison, puis vérifiez et confirmez. Vous recevrez un code de commande pour le suivi.",
    },
  },
  {
    q: { en: "What are your operating hours?", fr: "Quelles sont vos heures d'ouverture ?" },
    a: { en: "We operate every night from 6:00 PM to 4:00 AM.", fr: "Nous opérons chaque nuit de 18h00 à 4h00." },
  },
  {
    q: { en: "Which areas do you cover?", fr: "Quelles zones couvrez-vous ?" },
    a: {
      en: "We serve all seven Yaoundé arrondissements (Yaoundé I–VII) and approved surrounding areas. Biyem-Assi and greater Yaoundé VI is our priority hub with the fastest service. Some far or hard-to-reach spots need a quick dispatcher review before we confirm.",
      fr: "Nous desservons les sept arrondissements de Yaoundé (Yaoundé I–VII) et les zones environnantes approuvées. Biyem-Assi et le grand Yaoundé VI sont notre hub prioritaire avec le service le plus rapide. Certains endroits éloignés ou difficiles d'accès nécessitent une vérification rapide du dispatcher avant confirmation.",
    },
  },
  {
    q: { en: "How much does delivery cost?", fr: "Combien coûte la livraison ?" },
    a: {
      en: "The fee depends on the delivery zone: green (priority) is the lowest, yellow (standard/further) is a bit more, and red (far/difficult) is highest. The estimated fee is shown before you confirm, and the exact fee is calculated from your confirmed map location.",
      fr: "Les frais dépendent de la zone de livraison : vert (prioritaire) est le plus bas, jaune (standard/plus loin) un peu plus, et rouge (éloigné/difficile) le plus élevé. Le montant estimé s'affiche avant confirmation, et le montant exact est calculé à partir de votre position confirmée sur la carte.",
    },
  },
  {
    q: { en: "How do I pay?", fr: "Comment payer ?" },
    a: {
      en: "You can pay by cash on delivery, MTN Mobile Money, or Orange Money. For mobile money you pay to our merchant code and share the transaction reference. We never ask for your PIN or secret code — never share those with anyone.",
      fr: "Vous pouvez payer en espèces à la livraison, par MTN Mobile Money ou Orange Money. Pour le mobile money, vous payez sur notre code marchand et partagez la référence de transaction. Nous ne demandons jamais votre code PIN ou code secret — ne les partagez jamais.",
    },
  },
  {
    q: { en: "How is my medicine / prescription handled?", fr: "Comment mes médicaments / ordonnances sont-ils traités ?" },
    a: {
      en: "Medicine orders are handled with strict confidentiality. Any prescription you upload stays private — it is shared only with the assigned rider and is never shown in the shared order PDF or any public link.",
      fr: "Les commandes de médicaments sont traitées avec une stricte confidentialité. Toute ordonnance que vous téléchargez reste privée — elle n'est partagée qu'avec le livreur assigné et n'apparaît jamais dans le PDF de commande partagé ni dans aucun lien public.",
    },
  },
  {
    q: { en: "How do I track my order?", fr: "Comment suivre ma commande ?" },
    a: {
      en: "Use the Track Order option with your order code (starts with UNL-). You'll see the live status and, once a rider is assigned, their live location on the map.",
      fr: "Utilisez l'option Suivre la commande avec votre code (commençant par UNL-). Vous verrez le statut en direct et, une fois un livreur assigné, sa position en direct sur la carte.",
    },
  },
  {
    q: { en: "Can I change or cancel an order?", fr: "Puis-je modifier ou annuler une commande ?" },
    a: {
      en: "Yes — contact us as early as possible with your order code through the support form below or WhatsApp. Changes are easier before a rider has picked up your items.",
      fr: "Oui — contactez-nous le plus tôt possible avec votre code de commande via le formulaire d'assistance ci-dessous ou WhatsApp. Les modifications sont plus faciles avant que le livreur ait récupéré vos articles.",
    },
  },
  {
    q: { en: "What can't be delivered?", fr: "Que ne pouvons-nous pas livrer ?" },
    a: {
      en: "We don't carry cash, illegal items, weapons, or anything unsafe or prohibited by law. Declared value is insured only up to the approved coverage limit.",
      fr: "Nous ne transportons pas d'espèces, d'articles illégaux, d'armes, ni rien de dangereux ou interdit par la loi. La valeur déclarée n'est assurée que jusqu'à la limite de couverture approuvée.",
    },
  },
  {
    q: { en: "How do I become a rider?", fr: "Comment devenir livreur ?" },
    a: {
      en: "Send us a message using the support form below and choose \"Become a rider\", or email us. Approved riders log in from the rider portal to receive and manage deliveries.",
      fr: "Envoyez-nous un message via le formulaire ci-dessous en choisissant « Devenir livreur », ou écrivez-nous par e-mail. Les livreurs approuvés se connectent depuis le portail livreur pour recevoir et gérer les livraisons.",
    },
  },
];

const CATEGORIES = [
  { v: "ORDER_ISSUE", en: "Order issue", fr: "Problème de commande" },
  { v: "PAYMENT", en: "Payment", fr: "Paiement" },
  { v: "DELIVERY_AREA", en: "Delivery area", fr: "Zone de livraison" },
  { v: "BECOME_RIDER", en: "Become a rider", fr: "Devenir livreur" },
  { v: "PARTNERSHIP", en: "Partnership", fr: "Partenariat" },
  { v: "OTHER", en: "Other", fr: "Autre" },
] as const;

export function HelpContent() {
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [form, setForm] = useState({ fullName: "", whatsappNumber: "", email: "", orderCode: "", category: "ORDER_ISSUE", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);

  async function submit() {
    setError(false);
    if (form.fullName.trim().length < 2 || form.message.trim().length < 5) { setError(true); return; }
    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  }

  const mailtoBody = encodeURIComponent(
    `Name: ${form.fullName}\nWhatsApp: ${form.whatsappNumber}\nOrder code: ${form.orderCode}\nCategory: ${form.category}\n\n${form.message}`
  );
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Urban Night Lift support")}&body=${mailtoBody}`;

  const inputCls = "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-500 focus:outline-none";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 pb-16 pt-6">
      <div>
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-6 w-6 text-violet-400" />
          <h1 className="font-display text-2xl font-bold">{fr ? "Centre d'aide" : "Help Center"}</h1>
        </div>
        <p className="mt-1 text-sm text-mist-400">
          {fr ? "Trouvez une réponse rapide ci-dessous, ou écrivez-nous — nous répondons chaque nuit pendant nos heures d'ouverture." : "Find a quick answer below, or message us — we reply every night during our operating hours."}
        </p>
      </div>

      {/* Contact options — email first */}
      <div className="grid gap-3 sm:grid-cols-2">
        <a href={mailto} className="flex items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900/50 p-4">
          <Mail className="h-5 w-5 text-gold-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-mist-100">{fr ? "E-mail" : "Email us"}</p>
            <p className="truncate text-xs text-mist-500">{SUPPORT_EMAIL}</p>
          </div>
        </a>
        <a href={`tel:+237680038004`} className="flex items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900/50 p-4">
          <MessageCircle className="h-5 w-5 text-safe" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-mist-100">{fr ? "Appeler" : "Call us"}</p>
            <p className="truncate text-xs text-mist-500">{PHONE_DISPLAY}</p>
          </div>
        </a>
      </div>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20">
        <h2 className="mb-2 font-display text-sm font-semibold text-gold-300">{fr ? "Questions fréquentes" : "Frequently asked questions"}</h2>
        <div className="flex flex-col gap-2">
          {FAQS.map((f, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/40">
              <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-mist-100">
                {fr ? f.q.fr : f.q.en}
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-mist-500 transition-transform", openFaq === i && "rotate-180")} />
              </button>
              {openFaq === i && <p className="border-t border-ink-800 px-4 py-3 text-sm leading-relaxed text-mist-300">{fr ? f.a.fr : f.a.en}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Support form */}
      <section id="contact" className="scroll-mt-20 rounded-2xl border border-ink-700 bg-ink-900/40 p-4">
        <h2 className="mb-1 font-display text-sm font-semibold text-gold-300">{fr ? "Nous écrire" : "Send us a message"}</h2>
        <p className="mb-3 text-xs text-mist-500">{fr ? "Nous répondons généralement pendant nos heures de nuit (18h–4h)." : "We usually reply during our night hours (6 PM–4 AM)."}</p>

        {sent ? (
          <div className="flex items-start gap-3 rounded-xl border border-safe/30 bg-safe/10 p-4 text-sm text-safe">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{fr ? "Message reçu ! Notre équipe vous contactera bientôt. Vous pouvez aussi nous écrire directement à " : "Got it! Our team will reach out soon. You can also email us directly at "}<a className="underline" href={mailto}>{SUPPORT_EMAIL}</a>.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input className={inputCls} placeholder={fr ? "Votre nom *" : "Your name *"} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} inputMode="tel" placeholder="WhatsApp" value={form.whatsappNumber} onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })} />
              <input className={inputCls} placeholder={fr ? "Code commande" : "Order code"} value={form.orderCode} onChange={(e) => setForm({ ...form, orderCode: e.target.value })} />
            </div>
            <input className={inputCls} type="email" placeholder={fr ? "E-mail (optionnel)" : "Email (optional)"} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{fr ? c.fr : c.en}</option>)}
            </select>
            <textarea className={cn(inputCls, "min-h-24 resize-y")} placeholder={fr ? "Comment pouvons-nous aider ? *" : "How can we help? *"} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            {error && <p className="text-xs text-restricted">{fr ? "Veuillez renseigner votre nom et un message." : "Please enter your name and a message."}</p>}
            <Button size="md" onClick={submit} disabled={sending}>
              <Send className="h-4 w-4" /> {sending ? (fr ? "Envoi…" : "Sending…") : (fr ? "Envoyer" : "Send message")}
            </Button>
          </div>
        )}
      </section>

      {/* WhatsApp — last resort */}
      <a href={buildWaLink(MAIN_WHATSAPP_NUMBER, "Bonjour Urban Night Lift, j'ai besoin d'aide.")} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl border border-ink-700 bg-ink-900/50 px-4 py-2.5 text-sm text-mist-300">
        <MessageCircle className="h-4 w-4 text-safe" /> {fr ? "Toujours besoin d'aide ? WhatsApp" : "Still need help? WhatsApp us"}
      </a>

      {/* Staff / rider access */}
      <div className="flex items-center justify-center gap-4 border-t border-ink-800 pt-4 text-xs text-mist-500">
        <ShieldCheck className="h-4 w-4" />
        <Link href="/admin/login" className="underline hover:text-mist-300">{fr ? "Connexion staff" : "Staff login"}</Link>
        <span>·</span>
        <Link href="/rider/login" className="flex items-center gap-1 underline hover:text-mist-300"><Bike className="h-3.5 w-3.5" /> {fr ? "Connexion livreur" : "Rider login"}</Link>
      </div>
    </div>
  );
}
