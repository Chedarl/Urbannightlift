"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, Check, X } from "lucide-react";

import { ChatPanel } from "@/components/shared/ChatPanel";

/**
 * Ask the console what needs you.
 *
 * The owner asked why there was no chat in settings. There was none because the
 * customer assistant is deliberately hidden on `/admin` — it is grounded in one
 * customer's own orders, so on a dispatcher's screen it would be answering the
 * wrong person out of the wrong data. This is the staff one, and it now lives in
 * **Customer service**, where the owner said it belongs, rather than on a
 * settings page nobody opens mid-shift.
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
 *
 * The chat mechanics — streaming, Stop, New chat, the conversation staying on
 * screen — are `ChatPanel`, shared with the customer's. Two implementations of
 * one idea is exactly how they drifted into behaving differently, which is what
 * was reported.
 */

interface StaffRequest {
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
  request: StaffRequest;
}

const OPENERS = [
  "What needs me right now?",
  "Which businesses are waiting to be verified?",
  "Is anything failing?",
];

/**
 * Where it is standing.
 *
 * `panel` is the card inside Customer service — dense, capped, sharing a screen
 * with the queue it is talking about. `page` is the same thing with a room of
 * its own: full height, normal text, and the conversation is what the screen is
 * for. One component either way, because two implementations of one idea is
 * exactly how the customer and staff chats drifted into behaving differently,
 * which is what got reported.
 */
export function StaffAssistant({ variant = "panel" }: { variant?: "panel" | "page" } = {}) {
  const [pending, setPending] = useState<Offer | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const page = variant === "page";

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
    <div
      className={
        page
          ? "flex h-[calc(100dvh-9rem)] flex-col rounded-2xl border border-violet-700/40 bg-violet-900/10 p-4"
          : "rounded-xl border border-violet-700/40 bg-violet-900/10 p-3"
      }
    >
      <p className={`flex items-center gap-2 font-semibold text-violet-300 ${page ? "text-base" : "text-sm"}`}>
        <Sparkles className="h-4 w-4" /> Ask the console
      </p>
      <p className="mt-1 text-xs leading-relaxed text-mist-500">
        It reads tonight&apos;s queue, the businesses waiting to be verified, cases nobody has
        answered and what the AI itself has been failing at. It suggests buttons; you press them,
        and your name goes on what they do.
      </p>

      <div className={page ? "mt-3 flex min-h-0 flex-1 flex-col" : "mt-3"}>
        <ChatPanel
          endpoint="/api/admin/assistant"
          openers={OPENERS}
          dense={!page}
          className={page ? "flex min-h-0 flex-1 flex-col gap-3" : undefined}
          copy={{
            placeholder: "Ask about tonight…",
            intro: "Ask what needs you, who is waiting, or why something is failing.",
            thinking: "Reading tonight…",
            stop: "Stop",
            newChat: "New chat",
            send: "Send",
            stopped: "You stopped this answer.",
            unreachable: "Couldn't reach the server.",
            noAnswer: "I couldn't answer that.",
          }}
          renderActions={(actions) => (
            <div className="mt-2 flex flex-wrap gap-2">
              {(actions as Offer[]).map((offer, j) =>
                offer.request?.type === "link" ? (
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
                    // A mutation is deliberately gold rather than violet: it
                    // should not look like the links beside it.
                    className="rounded-lg border border-gold-400/50 bg-gold-400/10 px-3 py-1.5 text-xs font-semibold text-gold-200"
                  >
                    {offer.label}
                  </button>
                )
              )}
            </div>
          )}
        />
      </div>

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
    </div>
  );
}
