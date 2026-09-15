"use client";

import Link from "next/link";
import { Sparkles, Clock, Coins, Pill, MapPin, ArrowLeft, LifeBuoy } from "lucide-react";

import { ChatPanel, type ChatTurn } from "@/components/shared/ChatPanel";
import { actionHref, type Action } from "@/lib/ai/assistant/actions";
import { useTranslation } from "@/lib/i18n";

/**
 * The assistant as a place rather than a pop-up.
 *
 * Everything underneath is the same as the corner bubble's — the same endpoint,
 * the same fixed list of actions the model may propose, the same server-side
 * gate that discards an order code the asker does not own. Nothing here
 * authorises anything new. What changes is the framing.
 *
 * ## Why the capabilities are written down
 *
 * A blank box with a cursor tells you nothing about what is behind it, so
 * people type the narrowest thing they can think of — "what time do you open" —
 * and conclude it is a FAQ. It is not: it knows which pharmacies are on duty
 * tonight, what a delivery to Mvan costs, and where the asker's own order has
 * got to.
 *
 * The four cards are that, said plainly. They are not decoration and they are
 * not prompts-as-marketing: each one is a real question this thing answers
 * well, and tapping it sends exactly that text. They live in `ChatPanel`'s
 * empty state, so they are there on the first visit and after "new chat" — the
 * two moments a blank box is least helpful — and gone the instant there is a
 * conversation to read, because then the conversation is the page.
 *
 * ## Why Help is on this screen and not in the tab bar
 *
 * This took the Help tab's slot. Six labels do not fit a 390px screen, and two
 * tabs that both mean "I need something explained" is a split rather than a
 * choice. But a delivery business at 1 a.m. must never bury the way to a human,
 * so the link to Help sits in this header, in view at all times, one tap away.
 */
export function AssistantPage() {
  const { locale } = useTranslation();
  const fr = locale === "fr";

  const CAPABILITIES: { icon: typeof Clock; title: string; ask: string }[] = fr
    ? [
        { icon: Clock, title: "Ce soir", ask: "Vous livrez jusqu'à quelle heure ce soir ?" },
        { icon: Coins, title: "Le prix", ask: "Combien coûte une livraison de Bastos à Mvan ?" },
        { icon: Pill, title: "De garde", ask: "Quelles pharmacies sont de garde maintenant ?" },
        { icon: MapPin, title: "Ma commande", ask: "Où en est ma commande ?" },
      ]
    : [
        { icon: Clock, title: "Tonight", ask: "How late are you delivering tonight?" },
        { icon: Coins, title: "The price", ask: "What does a delivery from Bastos to Mvan cost?" },
        { icon: Pill, title: "On duty", ask: "Which pharmacies are on duty right now?" },
        { icon: MapPin, title: "My order", ask: "Where has my order got to?" },
      ];

  return (
    /* A fixed-height column, not a growing page: the conversation scrolls inside
       itself so the composer stays put and the bottom nav never covers it. */
    <div className="mx-auto flex h-[100dvh] w-full max-w-lg flex-col px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-3">
      <header className="flex items-center gap-3 pb-3">
        <Link
          href="/"
          aria-label={fr ? "Retour" : "Back"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-ink-700 bg-ink-900 text-mist-300"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
            <Sparkles className="h-4 w-4 text-violet-300" />
            {fr ? "Demandez-nous" : "Ask us"}
          </h1>
          <p className="truncate text-xs text-mist-500">
            {fr ? "Répond à partir de ce qui se passe ce soir" : "Answers from what is actually happening tonight"}
          </p>
        </div>
        {/* The way to a person, never more than one tap away. */}
        <Link
          href="/help"
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-xs font-medium text-mist-300"
        >
          <LifeBuoy className="h-3.5 w-3.5" />
          {fr ? "Aide" : "Help"}
        </Link>
      </header>

      <ChatPanel
        endpoint="/api/assistant"
        extraBody={{ fr }}
        className="flex min-h-0 flex-1 flex-col gap-3"
        copy={{
          placeholder: fr ? "Écrivez votre question…" : "Type your question…",
          intro: fr
            ? "Posez une question sur nos horaires, nos tarifs, ce qui est ouvert, ou votre commande."
            : "Ask about our hours, our fees, what's open, or your order.",
          caveat: fr
            ? "Il répond à partir de nos informations réelles. Il ne promet jamais une heure d'arrivée ni un prix — une personne s'en charge."
            : "It answers from our real information. It never promises an arrival time or a price — a person does that.",
          thinking: fr ? "Je vérifie nos informations…" : "Checking our information…",
          stop: fr ? "Arrêter" : "Stop",
          newChat: fr ? "Nouvelle conversation" : "New chat",
          send: fr ? "Envoyer" : "Send",
          stopped: fr ? "Vous avez arrêté cette réponse." : "You stopped this answer.",
          unreachable: fr
            ? "Je n'ai pas pu joindre le serveur. Réessayez dans un instant."
            : "I couldn't reach the server. Try again in a moment.",
          noAnswer: fr ? "Je n'ai pas pu répondre." : "I couldn't answer that.",
        }}
        /*
          What it can do, said rather than discovered — and only while there is
          nothing else on screen to read.
        */
        emptyState={(ask) => (
          <div className="grid grid-cols-2 gap-2">
            {CAPABILITIES.map(({ icon: Icon, title, ask: question }) => (
              <button
                key={title}
                type="button"
                onClick={() => ask(question)}
                className="flex items-start gap-2 rounded-xl border border-ink-700 bg-ink-900/60 px-3 py-2.5 text-left transition-colors hover:border-violet-500/60"
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-mist-200">{title}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-mist-500">{question}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        /*
          A signed-in customer's turns are stored, so this picks up where it left
          off. Signed out it returns nothing, which is the design: there is no
          account to attach a conversation to, and giving a stranger a
          server-side record of what they typed would be tracking rather than a
          feature.
        */
        loadHistory={async () => {
          const res = await fetch("/api/assistant", { cache: "no-store" });
          const data = (await res.json()) as { turns?: { role: string; text: string }[] };
          return (data.turns ?? []).map(
            (t): ChatTurn => ({ from: t.role === "unl" ? "unl" : "you", text: t.text })
          );
        }}
        /*
          Buttons, not instructions. Each goes to a screen that already exists
          and already checks who is asking — the model only suggested it, and the
          server discarded anything this person does not own before it got here.
        */
        renderActions={(actions) => (
          <div className="mt-2 flex flex-wrap gap-2">
            {(actions as Action[]).map((action, j) => (
              <Link
                key={j}
                href={actionHref(action)}
                className="rounded-lg border border-violet-500/50 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200"
              >
                {action.label}
              </Link>
            ))}
          </div>
        )}
      />
    </div>
  );
}
