"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Sparkles } from "lucide-react";

import { useTranslation } from "@/lib/i18n";
import { ChatPanel, type ChatTurn } from "@/components/shared/ChatPanel";
import { actionHref, type Action } from "@/lib/ai/assistant/actions";

/**
 * Ask a question, get an answer grounded in what is actually true tonight.
 *
 * Two things make this more than a chat box:
 *
 * **It only knows what we handed it.** Hours, zones, fees, what is open, and —
 * for a signed-in customer — their own orders and saved places. A signed-out
 * visitor's context has no order data in it at all, so there is nothing for a
 * cleverly worded question to reach.
 *
 * **It offers buttons, and pressing them runs code that already exists.** The
 * model proposes an action; the server checks it against what this person
 * actually owns; the browser draws a link. Nothing here is executed by the model
 * saying so, which is the difference between "actionable" and "dangerous".
 *
 * Everything about how it *feels* — words arriving as they are written, Stop,
 * New chat, the conversation staying on screen — is `ChatPanel`, shared with the
 * staff console so the two cannot drift apart again.
 */

/**
 * Where it does not belong.
 *
 * A customer assistant on a dispatcher's screen would be answering the wrong
 * person from the wrong data, and the staff apps have their own. Mounted once at
 * the root and excluded here, rather than added to four customer surfaces and
 * forgotten on the fifth.
 */
const STAFF_PREFIXES = ["/admin", "/rider", "/merchant"];

/**
 * Where the button has to move rather than disappear.
 *
 * I hid this on `/order` in #119 on the grounds that the sticky price bar and
 * the bottom nav were already competing for that corner. That was the wrong
 * call: `/order` is the page customers are actually on, and "how much is
 * delivery to Bastos?" is asked *while* filling the form, not after. So it
 * comes back — lifted clear of the sticky bar instead of removed from under it.
 */
const BUSY_PREFIXES = ["/order"];

export function AssistantSheet() {
  const pathname = usePathname();
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const [open, setOpen] = useState(false);

  const openers = fr
    ? ["Vous livrez à quelle heure ?", "Combien coûte la livraison ?", "Qu'est-ce qui est ouvert ?"]
    : ["What hours do you deliver?", "How much is delivery?", "What's open right now?"];

  const path = pathname ?? "";
  if (STAFF_PREFIXES.some((p) => path.startsWith(p))) return null;

  // On the order form the sticky price-and-continue bar owns the bottom of the
  // screen, so the button sits above it rather than under it.
  const busy = BUSY_PREFIXES.some((p) => path.startsWith(p)) && !path.includes("/confirmation");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={fr ? "Poser une question" : "Ask a question"}
        // Clear of the thumb on a 390px screen, and clear of whatever else is
        // pinned to the bottom of this particular page.
        className={`fixed right-4 z-[900] flex h-12 w-12 items-center justify-center rounded-full border border-violet-400/40 bg-violet-600 text-white shadow-lg shadow-violet-900/40 ${
          busy ? "bottom-36" : "bottom-20"
        }`}
      >
        <MessageCircle className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[1100] flex flex-col bg-ink-950/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-violet-300">
          <Sparkles className="h-4 w-4" />
          {fr ? "Demandez-nous" : "Ask us"}
        </p>
        <button type="button" onClick={() => setOpen(false)} className="text-mist-400 hover:text-mist-100">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col overflow-hidden px-4 py-4">
        <ChatPanel
          endpoint="/api/assistant"
          extraBody={{ fr }}
          openers={openers}
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
           * Pick the conversation back up.
           *
           * A signed-in customer's turns are stored, so opening the sheet
           * tomorrow shows what was said tonight. Signed out this returns
           * nothing, which is the design: there is no account to attach a
           * conversation to, and giving a stranger a server-side record of what
           * they typed would be tracking rather than a feature.
           */
          loadHistory={async () => {
            const res = await fetch("/api/assistant", { cache: "no-store" });
            const data = (await res.json()) as { turns?: { role: string; text: string }[] };
            return (data.turns ?? []).map(
              (t): ChatTurn => ({ from: t.role === "unl" ? "unl" : "you", text: t.text })
            );
          }}
          /*
           * Buttons, not instructions. Each one goes to a screen that already
           * exists and already checks who is asking — the model only ever
           * suggested it, and the server already discarded anything this person
           * does not own.
           */
          renderActions={(actions) => (
            <div className="mt-2 flex flex-wrap gap-2">
              {(actions as Action[]).map((action, j) => (
                <Link
                  key={j}
                  href={actionHref(action)}
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-violet-500/50 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200"
                >
                  {action.label}
                </Link>
              ))}
            </div>
          )}
        />
      </div>
    </div>
  );
}
