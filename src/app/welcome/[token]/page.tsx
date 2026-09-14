import { notFound } from "next/navigation";
import Link from "next/link";
import { Download, MoonStar, Clock, ShieldCheck } from "lucide-react";
import { readWelcomeToken } from "@/lib/welcome/card";
import { loadWelcome } from "@/lib/welcome/deliver";
import { Logo } from "@/components/shared/Logo";
import { groupXaf } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Somebody's welcome, opened from a WhatsApp message.
 *
 * The page comes first and the PDF second, on purpose. This is opened on a
 * phone, on mobile data, usually at night — a link that answers with a download
 * prompt before it has said hello is a link people close. So the welcome is
 * readable here in full, and the card is offered to anyone who wants to keep or
 * forward it.
 *
 * Public, but only to whoever holds the token. A bad or expired one is a 404
 * rather than a 401: whether a particular person has an account is not
 * something to confirm to somebody trying URLs.
 */
export default async function WelcomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = readWelcomeToken(token);
  if (!claim) notFound();

  const welcome = await loadWelcome(claim.kind, claim.id);
  if (!welcome) notFound();

  const { card } = welcome;
  const fr = card.locale === "fr";
  const merchant = card.kind === "merchant";
  const first = card.name.trim().split(/\s+/)[0] || card.name;

  const steps = merchant
    ? fr
      ? [
          "Gardez vos articles et vos prix à jour — c'est ce que le client voit.",
          "Restez joignable sur WhatsApp le soir : nous appelons avant d'envoyer un livreur.",
          "Connectez-vous pour ouvrir ou fermer votre boutique.",
        ]
      : [
          "Keep your items and prices current — that is what the customer sees.",
          "Stay reachable on WhatsApp at night: we call before sending a rider.",
          "Sign in to open or close your shop.",
        ]
    : fr
      ? [
          "Dites-nous ce qu'il vous faut et où.",
          "Nous fixons le prix, vous payez, un livreur part.",
          "Donnez votre code au livreur — une fois la commande en main.",
        ]
      : [
          "Tell us what you need and where.",
          "We price it, you pay, a rider goes.",
          "Give the rider your code — only once it is in your hands.",
        ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-5 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <Logo />
        <p className="text-xs uppercase tracking-[0.2em] text-gold-400">
          {fr ? "Yaoundé · Toute la nuit" : "Yaoundé · All night"}
        </p>
      </header>

      <section className="rounded-3xl border border-violet-700/40 bg-gradient-to-b from-violet-900/30 to-ink-900 p-6 text-center">
        <MoonStar className="mx-auto h-7 w-7 text-gold-400" />
        <h1 className="mt-3 text-3xl font-bold text-mist-100">
          {merchant
            ? fr
              ? "Bienvenue à bord"
              : "Welcome aboard"
            : fr
              ? "Bienvenue"
              : "Welcome"}
          ,
        </h1>
        <p className="mt-1 text-3xl font-bold text-violet-300">{first}</p>
        <p className="mt-4 text-sm leading-relaxed text-mist-300">
          {merchant
            ? fr
              ? "Vos clients commandent la nuit, nous livrons. Votre commerce apparaît dans l'application, les clients choisissent chez vous, et un livreur vient chercher la commande."
              : "Your customers order at night and we deliver. Your business appears in the app, customers pick you, and a rider comes to collect the order."
            : fr
              ? "Nous livrons quand tout est fermé. Repas, pharmacie, courses, colis — vous dites ce qu'il vous faut, nous allons le chercher et nous vous l'apportons."
              : "We deliver when everything else is shut. Food, pharmacy, groceries, parcels — you say what you need, we go and get it, and we bring it to you."}
        </p>
      </section>

      <section className="flex items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <Clock className="h-5 w-5 shrink-0 text-violet-300" />
        <div>
          <p className="text-xs uppercase tracking-wider text-mist-500">
            {fr ? "Nous roulons" : "We ride"}
          </p>
          <p className="text-lg font-semibold text-mist-100">
            {fr
              ? `${card.openFrom} à ${card.openTo}, chaque nuit`
              : `${card.openFrom} to ${card.openTo}, every night`}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs uppercase tracking-[0.15em] text-gold-400">
          {merchant ? (fr ? "Ce qu'il faut faire" : "What to do") : fr ? "Comment ça marche" : "How it works"}
        </h2>
        <ol className="flex flex-col gap-3">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold-400/50 text-xs font-bold text-gold-400">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed text-mist-300">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-safe/30 bg-safe/5 p-4">
        <h2 className="mb-1 text-xs uppercase tracking-[0.15em] text-safe">
          {fr ? "Notre promesse" : "Our promise"}
        </h2>
        <p className="text-sm leading-relaxed text-mist-300">
          {merchant
            ? fr
              ? "Nous n'ajoutons aucune marge sur vos prix. Le client paie ce que vous facturez ; nous gagnons sur la livraison."
              : "We add nothing to your prices. The customer pays what you charge; we earn on the delivery."
            : fr
              ? "Aucune marge sur ce que nous achetons pour vous. Vous payez exactement le prix du commerçant — notre gain, c'est la livraison, annoncée d'avance."
              : "No markup on anything we buy for you. You pay exactly what the shop charged — what we earn is the delivery fee, told to you in advance."}
        </p>
      </section>

      {card.referralCode && (
        <section className="rounded-2xl border border-gold-400/50 bg-ink-900 p-5 text-center">
          <p className="text-xs uppercase tracking-[0.15em] text-gold-400">
            {fr ? "Votre code" : "Your code"}
          </p>
          <p className="my-2 font-mono text-3xl font-bold tracking-[0.2em] text-mist-100">
            {card.referralCode}
          </p>
          <p className="text-xs leading-relaxed text-mist-400">
            {card.friendDiscountXaf && card.friendDiscountXaf > 0
              ? fr
                ? `Donnez-le à un ami : il économise ${groupXaf(card.friendDiscountXaf)} XAF sur sa première nuit.`
                : `Give it to a friend: they save ${card.friendDiscountXaf.toLocaleString("en-GB")} XAF on their first night.`
              : fr
                ? "Donnez-le à un ami pour qu'il commence avec nous."
                : "Give it to a friend so they can start with us."}
          </p>
        </section>
      )}

      <a
        href={`/api/welcome/${token}/pdf`}
        className="flex items-center justify-center gap-2 rounded-xl border border-violet-500/50 bg-violet-600/20 px-4 py-3 text-sm font-semibold text-violet-200"
      >
        <Download className="h-4 w-4" />
        {fr ? "Télécharger ma carte" : "Download my card"}
      </a>

      {/* Said on every surface that mentions a PIN, and this is the first thing
          a new customer reads from us — which makes it the best place to say it. */}
      <p className="flex gap-2 rounded-xl border border-ink-700 bg-ink-950 p-3 text-xs leading-relaxed text-mist-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" />
        <span>
          {fr
            ? "Nous ne demandons jamais votre code PIN Mobile Money, votre code secret Orange, ni un OTP de votre banque. Jamais. Si quelqu'un le demande en notre nom, ce n'est pas nous."
            : "We never ask for your Mobile Money PIN, your Orange secret code, or a bank OTP. Not once. If somebody asks in our name, it is not us."}
        </span>
      </p>

      <Link
        href={merchant ? "/merchant" : "/account"}
        className="rounded-xl bg-violet-600 px-4 py-3 text-center text-sm font-semibold text-white"
      >
        {merchant
          ? fr
            ? "Ouvrir mon espace commerçant"
            : "Open my merchant portal"
          : fr
            ? "Commander maintenant"
            : "Order now"}
      </Link>

      <p className="pb-6 text-center text-xs text-mist-500">
        urbannighlift.com · urbannightlift@gmail.com · +237 680 038 004
      </p>
    </main>
  );
}
