"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Send, Loader2, Check, X } from "lucide-react";

/**
 * Ask the console what needs you.
 *
 * The owner asked why there was no chat in settings. There was none because the
 * customer assistant is deliberately hidden on `/admin` — it is grounded in one
 * customer's own orders, so on a dispatcher's screen it would be answering the
 * wrong person out of the wrong data. This is the staff one.
 *
 * It answers from the same rows the console renders, and it offers buttons.
 * Two rules make those buttons safe, and both are visible in this file:
 *
 * **A button is a request, sent from here, with your session.** The server hands
 * back a URL and a body for an endpoint that already exists; the browser calls
 * it. So `PATCH /api/merchants/[id]` still checks your role and still writes the
 * audit row with *your* name on it. The assistant did not gain a permission; it
 * saved you a walk.
 *
 * **Anything that changes something asks first.** Navigation is a plain link.
 * A mutation is a confirm step with the sentence spelled out, because the whole
 * risk of an actionable chat is the tap you make without reading.
 */

interface Request {
  type: "link" | "request";
  href?: string;
  method?: "PATCH";
  url?: string;
  body?: Record<string, unknown>;
  confirm?: string;
}

interface Offer {
  label: string;
  mutation: boolean;
  request: Request;
}

interface Turn {
  from: "you" | "unl";
  text: string;
  offers?: Offer[];
}

const OPENERS = [
  "What needs me right now?",
  "Which businesses are waiting to be verified?",
  "Is anything failing?",
];

export function StaffAssistant() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Offer | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  async function ask(text: string) {
    const asked = text.trim();
    if (!asked || busy) return;
    // Staff conversations are not stored: a dispatcher's console is shared, and
    // a thread left on it would follow whoever sat down next. The turns travel
    // in the request instead.
    const history = turns.map((t) => ({ role: t.from, text: t.text }));
    setTurns((prev) => [...prev, { from: "you", text: asked }]);
    setQuestion("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: asked, history }),
      });
      const data = await res.json();
      setTurns((prev) => [
        ...prev,
        {
          from: "unl",
          text: data.reply ?? "I couldn't answer that.",
          offers: Array.isArray(data.actions) ? data.actions : [],
        },
      ]);
    } catch {
      setTurns((prev) => [...prev, { from: "unl", text: "Couldn't reach the server." }]);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Runs the endpoint the button describes, from this browser, with this staff
   * session. A 403 here is the real gate refusing — exactly what would happen
   * on the screen — and is reported as such rather than swallowed.
   */
  async function run(offer: Offer) {
    setPending(null);
    setNote(null);
    const { url, method, body } = offer.request;
    if (!url || !method) return;
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (res.ok) {
        setNote(`Done — ${offer.label.toLowerCase()}. Refresh the screen to see it.`);
      } else {
        const data = await res.json().catch(() => ({}));
        setNote(
          res.status === 403 || res.status === 401
            ? "Your role does not allow that."
            : (data.error ?? `That did not go through (${res.status}).`)
        );
      }
    } catch {
      setNote("Couldn't reach the server.");
    }
  }

  return (
    <div className="rounded-xl border border-violet-700/40 bg-violet-900/10 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-violet-300">
        <Sparkles className="h-4 w-4" /> Ask the console
      </p>
      <p className="mt-1 text-xs leading-relaxed text-mist-500">
        It reads tonight&apos;s queue, the businesses waiting to be verified, cases nobody has
        answered and what the AI itself has been failing at. It suggests buttons; you press them,
        and your name goes on what they do.
      </p>

      {turns.length === 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {OPENERS.map((o) => (
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
      )}

      {turns.length > 0 && (
        <div className="mt-3 flex max-h-96 flex-col gap-3 overflow-y-auto">
          {turns.map((turn, i) => (
            <div key={i} className={turn.from === "you" ? "self-end" : "self-start"}>
              <div
                className={`max-w-md rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  turn.from === "you"
                    ? "bg-violet-600 text-white"
                    : "border border-ink-700 bg-ink-900 text-mist-200"
                }`}
              >
                {turn.text}
              </div>

              {turn.offers && turn.offers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {turn.offers.map((offer, j) =>
                    offer.request.type === "link" ? (
                      <Link
                        key={j}
                        href={offer.request.href ?? "#"}
                        className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-medium text-mist-200 hover:border-violet-500"
                      >
                        {offer.label}
                      </Link>
                    ) : (
                      <button
                        key={j}
                        type="button"
                        onClick={() => setPending(offer)}
                        // A mutation is deliberately gold rather than violet:
                        // it should not look like the links beside it.
                        className="rounded-lg border border-gold-400/50 bg-gold-400/10 px-3 py-1.5 text-xs font-semibold text-gold-200"
                      >
                        {offer.label}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <p className="flex items-center gap-2 self-start text-xs text-mist-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading tonight…
            </p>
          )}
          <div ref={endRef} />
        </div>
      )}

      {/*
        The confirm step. The sentence is written by `staffActions.ts` and says
        what will actually happen — "Customers will start seeing it" rather than
        "Are you sure?", which nobody reads.
      */}
      {pending && (
        <div className="mt-3 rounded-lg border border-gold-400/40 bg-gold-400/10 p-2.5">
          <p className="text-xs leading-relaxed text-gold-100">{pending.request.confirm}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => run(pending)}
              className="flex items-center gap-1.5 rounded-lg border border-safe/40 bg-safe/10 px-3 py-1 text-xs font-semibold text-safe"
            >
              <Check className="h-3.5 w-3.5" /> Yes, do it
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-1 text-xs text-mist-400"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </div>
      )}

      {note && <p className="mt-2 text-xs leading-relaxed text-mist-300">{note}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="mt-3 flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about tonight…"
          className="w-full bg-transparent text-xs text-mist-100 placeholder:text-mist-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || question.trim().length < 2}
          className="shrink-0 text-violet-300 disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
