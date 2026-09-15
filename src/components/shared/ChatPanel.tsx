"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Square, RotateCcw } from "lucide-react";

/**
 * One chat, wherever it is standing.
 *
 * The verdict was *"the chat is not functioning as it should, both for the
 * customer's end and the admin end… I needed an interactive chat which works as
 * how the chat of OpenAI does."* Both ends were built separately and drifted
 * apart: one streamed and had no stop, the other did not stream at all and had
 * no way to start over. Two implementations of one idea is how they stop
 * behaving alike, so there is now one.
 *
 * What this owns, and what it deliberately does not:
 *
 *  - **Owns the transport.** It posts the question, reads an SSE stream when it
 *    gets one, falls back to plain JSON when it does not, keeps the turns, and
 *    shows the words as they arrive.
 *  - **Owns Stop and New chat.** Both are things a person reaches for when a
 *    model is going the wrong way, and neither existed. Stop aborts the request
 *    and keeps whatever was written — mid-sentence text is still an answer.
 *  - **Does not own the buttons.** What an action *is* differs completely
 *    between the two ends — a customer's is a link to a screen they own, a
 *    dispatcher's may be a request that changes a merchant — so each caller
 *    renders its own through `renderActions`. Putting that in here would have
 *    meant one component knowing both permission models, which is precisely the
 *    thing that must not be shared.
 *
 * The reply text of a `done` event wins over what was streamed, because the
 * server may have shortened or replaced it after checking the whole object.
 */

export interface ChatTurn {
  from: "you" | "unl";
  text: string;
  /** Whatever the caller's grounding calls a button. Opaque here. */
  actions?: unknown[];
  followUps?: string[];
  /** Still arriving. Drawn with a caret so the wait reads as writing. */
  streaming?: boolean;
  /** They pressed Stop. Said once, quietly, so a short answer is not a mystery. */
  stopped?: boolean;
}

export interface ChatCopy {
  placeholder: string;
  /** Shown once, above the openers, before anything is asked. */
  intro: string;
  /** The honest line about what it will and will not do. */
  caveat?: string;
  thinking: string;
  stop: string;
  newChat: string;
  send: string;
  stopped: string;
  unreachable: string;
  noAnswer: string;
}

interface Props {
  endpoint: string;
  /** Extra fields this grounding needs — `fr` for a customer, nothing for staff. */
  extraBody?: Record<string, unknown>;
  /** Pills shown before anything is asked. Ignored when `emptyState` is given. */
  openers?: string[];
  /**
   * Draws the whole before-anything-is-asked block instead of the opener pills.
   *
   * A blank box with a cursor tells nobody what is behind it, so a surface that
   * wants to *say* what it can do needs the room where the pills were — and it
   * needs that block to disappear the moment a conversation starts, which only
   * this component knows. It is handed `ask` so whatever it draws can send a
   * question itself rather than reaching back through a ref.
   */
  emptyState?: (ask: (text: string) => void) => React.ReactNode;
  copy: ChatCopy;
  renderActions?: (actions: unknown[]) => React.ReactNode;
  /** Restores a stored conversation. Absent where nothing is stored. */
  loadHistory?: () => Promise<ChatTurn[]>;
  /** Staff panels sit inside a card and want smaller text than a full sheet. */
  dense?: boolean;
  /** A sheet fills the screen; a panel is capped so the page still scrolls. */
  className?: string;
}

export function ChatPanel({
  endpoint,
  extraBody,
  openers = [],
  emptyState,
  copy,
  renderActions,
  loadHistory,
  dense = false,
  className,
}: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  // Restore once. A conversation that fails to load is a blank sheet, which is
  // what it was before this existed — there is nothing useful to say about it.
  const loader = useRef(loadHistory);
  loader.current = loadHistory;
  useEffect(() => {
    let alive = true;
    loader.current?.().then(
      (rows) => {
        if (alive && rows.length > 0) setTurns((prev) => (prev.length > 0 ? prev : rows));
      },
      () => {}
    );
    return () => {
      alive = false;
    };
  }, []);

  /** Replace the answer being written, wherever it ended up in the list. */
  const patch = useCallback((update: Partial<ChatTurn>) => {
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
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const asked = text.trim();
      if (!asked || busy) return;

      // Everything said before this question. The server may ignore it — a
      // signed-in customer's real history comes from the database — so this can
      // never put words in our mouth where it matters.
      const history = turns.map((t) => ({ role: t.from, text: t.text }));
      setTurns((prev) => [...prev, { from: "you", text: asked }, { from: "unl", text: "", streaming: true }]);
      setQuestion("");
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: asked, history, ...(extraBody ?? {}) }),
          signal: controller.signal,
        });

        // Not every answer streams. A refusal, a rate limit and a
        // not-configured notice are all fixed sentences with nothing to stream,
        // and the fallback path in `kimiStream` returns whole answers too.
        if (!res.body || !res.headers.get("content-type")?.includes("event-stream")) {
          const data = await res.json().catch(() => ({}));
          patch({
            text: data.reply ?? copy.noAnswer,
            actions: Array.isArray(data.actions) ? data.actions : [],
            followUps: Array.isArray(data.followUps) ? data.followUps : [],
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
          // Events are blank-line separated and a chunk can end mid-event, so
          // the tail is carried over rather than parsed.
          const events = pending.split("\n\n");
          pending = events.pop() ?? "";

          for (const raw of events) {
            const line = raw.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let payload: { text?: string; reply?: string; actions?: unknown[]; followUps?: string[] };
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

        // A stream that ended without a done event still leaves what was
        // written on screen rather than clearing it.
        patch({ streaming: false });
      } catch (err) {
        // Stop is not a failure. Keep the words, mark why it is short.
        if ((err as Error)?.name === "AbortError") {
          patch({ streaming: false, stopped: true });
          return;
        }
        patch({ text: copy.unreachable, streaming: false });
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [busy, turns, endpoint, extraBody, patch, copy.noAnswer, copy.unreachable]
  );

  const bubble = dense ? "text-xs" : "text-sm";

  return (
    <div className={className ?? "flex flex-col gap-3"}>
      <div className={dense ? "flex max-h-96 flex-col gap-3 overflow-y-auto" : "flex flex-1 flex-col gap-3 overflow-y-auto"}>
        {turns.length === 0 && (
          <div>
            <p className={`leading-relaxed text-mist-300 ${bubble}`}>{copy.intro}</p>
            {emptyState ? (
              <div className="mt-3">{emptyState(ask)}</div>
            ) : (
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
            )}
            {copy.caveat && (
              <p className="mt-4 text-xs leading-relaxed text-mist-600">{copy.caveat}</p>
            )}
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className={turn.from === "you" ? "self-end" : "self-start"}>
            <div
              className={`max-w-[85vw] whitespace-pre-wrap rounded-2xl px-3 py-2 leading-relaxed sm:max-w-md ${bubble} ${
                turn.from === "you" ? "bg-violet-600 text-white" : "border border-ink-700 bg-ink-900 text-mist-200"
              }`}
            >
              {turn.text}
              {turn.streaming && (
                <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-violet-300 align-middle" />
              )}
            </div>

            {turn.stopped && <p className="mt-1 text-xs text-mist-600">{copy.stopped}</p>}

            {/*
              Whatever this grounding calls a button. Rendered by the caller,
              because a customer's action and a dispatcher's action answer to
              completely different permission models and neither belongs here.
            */}
            {!turn.streaming && turn.actions && turn.actions.length > 0 && renderActions?.(turn.actions)}

            {/*
              What they might ask next, in their words. A chat that answers and
              stops is a search box. Drawn unlike the action buttons on purpose:
              one of these asks a question, the other takes you somewhere.
            */}
            {!turn.streaming && turn.followUps && turn.followUps.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {turn.followUps.map((q, j) => (
                  <button
                    key={j}
                    type="button"
                    onClick={() => ask(q)}
                    disabled={busy}
                    className="rounded-full border border-ink-700 bg-ink-900 px-3 py-1 text-xs text-mist-400 hover:border-violet-500 hover:text-mist-200 disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/*
          Only until the first word lands. Once text is arriving, the text is
          the progress and a spinner beside it is noise.
        */}
        {busy && !turns.some((t) => t.streaming && t.text.length > 0) && (
          <p className="flex items-center gap-2 self-start text-xs text-mist-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {copy.thinking}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={copy.placeholder}
            className={`w-full bg-transparent text-mist-100 placeholder:text-mist-500 focus:outline-none ${bubble}`}
          />
          {busy ? (
            // Stop, where Send was. One control, one place, and it is the
            // control you want the moment an answer starts going wrong.
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="shrink-0 text-caution"
              aria-label={copy.stop}
              title={copy.stop}
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={question.trim().length < 2}
              className="shrink-0 text-violet-300 disabled:opacity-40"
              aria-label={copy.send}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>

        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              setTurns([]);
            }}
            className="flex items-center gap-1.5 self-start text-xs text-mist-500 hover:text-mist-300"
          >
            <RotateCcw className="h-3 w-3" />
            {copy.newChat}
          </button>
        )}
      </form>
    </div>
  );
}
