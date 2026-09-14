import Link from "next/link";
import { LogIn, UserPlus, ShieldCheck, History, MapPin, Bell } from "lucide-react";
import { CustomerHeader } from "@/components/customer/CustomerHeader";

/**
 * The door to ordering, when an account is required.
 *
 * The business decided every client signs up before they order, so this stands
 * where the order form used to for anyone not signed in. It is not a wall —
 * it is the reason the wall is worth it: your orders in one private place, your
 * addresses remembered, someone you trust able to watch you home. A guest pile
 * of anonymous rows becomes a relationship the first time somebody sets a PIN.
 *
 * `next` carries them straight back to what they were trying to do, so signing
 * up costs one screen and no lost intent.
 */
export function OrderGate({ next = "/order", fr }: { next?: string; fr: boolean }) {
  const q = `?next=${encodeURIComponent(next)}`;
  return (
    <>
      <CustomerHeader />
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
            <ShieldCheck className="h-7 w-7" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold text-mist-100">
            {fr ? "Créez votre compte pour commander" : "Create your account to order"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-mist-400">
            {fr
              ? "Chez Urban Night Lift, chaque commande se passe dans votre espace privé — pas dans un chat public. Un compte, et tout est à vous."
              : "At Urban Night Lift every order happens inside your own private space — not a public chat. One account, and it's all yours."}
          </p>
        </div>

        <ul className="flex flex-col gap-2.5">
          <Perk icon={<History className="h-4 w-4" />} fr={fr} en="Every order and receipt, kept in one place" frr="Chaque commande et reçu, au même endroit" />
          <Perk icon={<MapPin className="h-4 w-4" />} fr={fr} en="Your addresses saved for next time" frr="Vos adresses enregistrées pour la prochaine fois" />
          <Perk icon={<Bell className="h-4 w-4" />} fr={fr} en="Live tracking, and a link to let someone watch you home" frr="Suivi en direct, et un lien pour vous faire suivre par un proche" />
        </ul>

        <div className="flex flex-col gap-2.5">
          <Link
            href={`/account/signup${q}`}
            className="flex items-center justify-center gap-2 rounded-xl bg-gold-400 px-4 py-3 text-sm font-bold text-ink-950 transition-colors hover:bg-gold-300"
          >
            <UserPlus className="h-4 w-4" /> {fr ? "Créer mon compte" : "Create my account"}
          </Link>
          <Link
            href={`/account/login${q}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-ink-700 px-4 py-3 text-sm font-semibold text-mist-200 transition-colors hover:border-violet-500/50"
          >
            <LogIn className="h-4 w-4" /> {fr ? "J'ai déjà un compte" : "I already have an account"}
          </Link>
        </div>

        <p className="text-center text-xs leading-relaxed text-mist-600">
          {fr
            ? "Votre code est un code Urban Night Lift — jamais votre code MoMo, Orange Money ou banque."
            : "Your PIN is an Urban Night Lift PIN — never your MoMo, Orange Money or bank code."}
        </p>
      </main>
    </>
  );
}

function Perk({ icon, en, frr, fr }: { icon: React.ReactNode; en: string; frr: string; fr: boolean }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5">
      <span className="mt-0.5 text-violet-300">{icon}</span>
      <span className="text-sm text-mist-300">{fr ? frr : en}</span>
    </li>
  );
}
