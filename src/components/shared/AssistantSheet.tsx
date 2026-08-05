"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, Loader2, Sparkles } from "lucide-react";

import { useTranslation } from "@/lib/i18n";
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
 * The wait is named rather than hidden. A grounded answer takes several seconds
 * on this key, and a spinner that says what it is doing reads as working —
 * whereas a silent one reads as broken.
 */

interface Turn {
  from: "you" | "unl";
  text: string;
  actions?: Action[];
  followUps?: string[];
  /** Still arriving. Renders with a caret so the wait reads as writing. */
  streaming?: boolean;
}

/**
 * Where it does not belong.
 *
 * A customer assistant on a dispatcher's screen would be answering the wrong
 * person from the wrong data, and the staff apps already have a per-page guide.
 * Mounted once at the root and excluded here, rather than added to four
 * customer surfaces and forgotten on the fifth.
 */
const STAFF_PREFIXES = ["/admin", "/rider", "/merchant"];

/**
 * And where it is simply in the way.
 *
 * The order flow already has a sticky price-and-continue bar pinned to the
 * bottom of the screen, and the bottom nav under that. A third floating button
 * on top of both is clutter at exactly the moment somebody is trying to finish
 * an order — which is what the plan said ("deliberately not on the order form")
 * before this got mounted at the root and applied to everything.
 */
const BUSY_PREFIXES = ["/order"];

export function AssistantSheet() {
  const pathname = usePathname();
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  /**
   * Pick the conversation back up.
   *
   * A signed-in customer's turns are stored, so opening the sheet tomorrow
   * shows what was said tonight. Signed out this returns nothing, which is the
   * design: there is no account to attach a conversation to, and giving a
   * stranger a server-side record of what they typed would be tracking rather
   * than a feature.
   */
  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    fetch("/api/assistant", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { turns?: { role: string; text: string }[] }) => {
        const rows = data.turns ?? [];
        if (rows.length === 0) return;
        setTurns((prev) =>
          prev.length > 0 ? prev : rows.map((t) => ({ from: t.role === "unl" ? "unl" : "you", text: t.text }))
        );
      })
      .catch(() => {
        // A conversation that fails to load is a blank sheet, which is exactly
        // what it was before this existed. Nothing to say about it.
      });
  }, [open, loaded]);

  async function ask(text: string) {
    const asked = text.trim();
    if (!asked || busy) return;
    // Everything before this question, for a visitor with nothing stored. The
    // server ignores it entirely for a signed-in customer and reads their own
    // rows instead, so this can never put words in our mouth.
    const history = turns.map((t) => ({ role: t.from, text: t.text }));
    setTurns((prev) => [...prev, { from: "you", text: asked }, { from: "unl", text: "", streaming: true }]);
    setQuestion("");
    setBusy(true);

    /** Replace the answer being written, wherever it ended up in the list. */
    function patch(update: Partial<Turn>) {
      setTurns((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].from === "unl" && next[i].streaming) {
            next[i] = { ...next[i], ...update };
            break;
          }
        }
        return next;
      });
    }

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: asked, fr, history }),
      });

      // The not-configured and rate-limited replies are plain JSON — there is
      // nothing to stream when the answer is a fixed sentence.
      if (!res.body || !res.headers.get("content-type")?.includes("event-stream")) {
        const data = await res.json().catch(() => ({}));
        patch({
          text: data.reply ?? (fr ? "Je n'ai pas pu répondre." : "I couldn't answer that."),
          actions: Array.isArray(data.actions) ? data.actions : [],
          streaming: false,
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let shown = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        // Events are blank-line separated; a chunk can end mid-event, so the
        // tail is carried over rather than parsed.
        const events = pending.split("\n\n");
        pending = events.pop() ?? "";

        for (const raw of events) {
          const line = raw.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let payload: { text?: string; reply?: string; actions?: Action[]; followUps?: string[] };
          try {
            payload = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }

          if (raw.includes("event: delta") && typeof payload.text === "string") {
            shown += payload.text;
            patch({ text: shown });
          } else if (raw.includes("event: done")) {
            patch({
              text: payload.reply ?? shown,
              actions: payload.actions ?? [],
              followUps: payload.followUps ?? [],
              streaming: false,
            });
          }
        }
      }

      // A stream that ended without a done event still leaves what was written.
      patch({ streaming: false });
    } catch {
      patch({
        text: fr
          ? "Je n'ai pas pu joindre le serveur. Réessayez dans un instant."
          : "I couldn't reach the server. Try again in a moment.",
        streaming: false,
      });
    } finally {
      setBusy(false);
    }
  }

  const openers = fr
    ? ["Vous livrez à quelle heure ?", "Combien coûte la livraison ?", "Qu'est-ce qui est ouvert ?"]
    : ["What hours do you deliver?", "How much is delivery?", "What's open right now?"];

  const path = pathname ?? "";
  if (STAFF_PREFIXES.some((p) => path.startsWith(p))) return null;
  // Still reachable on the confirmation screen, which is where "where is my
  // rider" actually gets asked — only the form itself is left alone.
  if (BUSY_PREFIXES.some((p) => path.startsWith(p)) && !path.includes("/confirmation")) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={fr ? "Poser une question" : "Ask a question"}
        // Above the bottom nav on the portal, clear of the thumb on a 390px
        // screen, and out of the way of the sticky order buttons.
        className="fixed bottom-20 right-4 z-[900] flex h-12 w-12 items-center justify-center rounded-full border border-violet-400/40 bg-violet-600 text-white shadow-lg shadow-violet-900/40"
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

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {turns.length === 0 && (
          <div className="mx-auto max-w-lg">
            <p className="text-sm leading-relaxed text-mist-300">
              {fr
                ? "Posez une question sur nos horaires, nos tarifs, ce qui est ouvert, ou votre commande."
                : "Ask about our hours, our fees, what's open, or your order."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {openers.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => ask(o)}
                  className="rounded-full border border-ink-700 bg-ink-900 px-3 py-1.5 text-xs text-mist-300 hover:border-violet-500"
                >
                  {o}
                </button>
              ))}
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-mist-600">
              {fr
                ? "Il répond à partir de nos informations réelles. Il ne promet jamais une heure d'arrivée ni un prix — une personne s'en charge."
                : "It answers from our real information. It never promises an arrival time or a price — a person does that."}
            </p>
          </div>
        )}

        <div className="mx-auto flex max-w-lg flex-col gap-3">
          {turns.map((turn, i) => (
            <div key={i} className={turn.from === "you" ? "self-end" : "self-start"}>
              <div
                className={`max-w-[85vw] rounded-2xl px-3 py-2 text-sm leading-relaxed sm:max-w-md ${
                  turn.from === "you"
                    ? "bg-violet-600 text-white"
                    : "border border-ink-700 bg-ink-900 text-mist-200"
                }`}
              >
                {turn.text}
                {/* A caret while the words are still arriving. The wait now
                    reads as writing rather than as a stalled request. */}
                {turn.streaming && (
                  <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-violet-300 align-middle" />
                )}
              </div>

              {/*
                Buttons, not instructions. Each one goes to a screen that already
                exists and already checks who is asking — the model only ever
                suggested it, and the server already discarded anything this
                person does not own.
              */}
              {turn.actions && turn.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {turn.actions.map((action, j) => (
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

              {/*
                What they might ask next, in their words. A chat that answers
                and stops is a search box; these are what carry a conversation
                for somebody who does not know what else we can tell them.
                Deliberately drawn unlike the action buttons — one of these asks
                a question, the other takes you somewhere.
              */}
              {!turn.streaming && turn.followUps && turn.followUps.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {turn.followUps.map((q, j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => ask(q)}
                      disabled={busy}
                      className="rounded-full border border-ink-700 bg-ink-900 px-3 py-1 text-[11px] text-mist-400 hover:border-violet-500 hover:text-mist-200 disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/*
            Only until the first word lands. Once text is arriving the text is
            the progress, and a spinner beside it is noise.
          */}
          {busy && !turns.some((t) => t.streaming && t.text.length > 0) && (
            <p className="flex items-center gap-2 self-start text-xs text-mist-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {fr ? "Je vérifie nos informations…" : "Checking our information…"}
            </p>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="border-t border-ink-700 px-4 py-3"
      >
        <div className="mx-auto flex max-w-lg items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={fr ? "Écrivez votre question…" : "Type your question…"}
            className="w-full bg-transparent text-sm text-mist-100 placeholder:text-mist-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || question.trim().length < 2}
            className="shrink-0 text-violet-300 disabled:opacity-40"
            aria-label={fr ? "Envoyer" : "Send"}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
