"use client";

import { useEffect, useState, useCallback } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { cn } from "@/lib/utils";

/**
 * "Something went wrong with this order" — and an actual conversation about it.
 *
 * The Help Centre form stored a message nobody could reply to while telling the
 * customer we would reach out. This attaches the complaint to the order it is
 * about, so there is no code to type and no context to re-explain, and staff
 * replies come back to the same place.
 */

interface CaseMessage {
  body: string;
  authorType: string;
  authorName: string;
  createdAt: string;
}

interface CaseRow {
  id: string;
  category: string;
  status: string;
  createdAt: string;
  messages: CaseMessage[];
}

const CATEGORIES = [
  { value: "ORDER_ISSUE", en: "A problem with this order", fr: "Un problème avec cette commande" },
  { value: "PAYMENT", en: "A payment problem", fr: "Un problème de paiement" },
  { value: "DELIVERY_AREA", en: "Delivery or address", fr: "Livraison ou adresse" },
  { value: "OTHER", en: "Something else", fr: "Autre chose" },
];

export function OrderCaseThread({ orderCode, fr }: { orderCode: string; fr: boolean }) {
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("ORDER_ISSUE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/track/${orderCode}/case`);
    if (!res.ok) {
      setCases([]);
      return;
    }
    const data = await res.json();
    setCases(data.cases ?? []);
  }, [orderCode]);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    if (message.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/track/${orderCode}/case`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, category }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? (fr ? "Message non envoyé." : "Message not sent."));
        return;
      }
      setMessage("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const hasThread = cases != null && cases.length > 0;

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 font-display text-sm font-semibold text-mist-100">
          <MessageSquare className="h-4 w-4 text-violet-300" />
          {hasThread
            ? fr ? "Vos messages sur cette commande" : "Your messages about this order"
            : fr ? "Un problème avec cette commande ?" : "Something wrong with this order?"}
        </span>
        <span className="text-xs text-mist-500">{open ? (fr ? "Fermer" : "Close") : (fr ? "Ouvrir" : "Open")}</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {hasThread &&
            cases!.map((c) => (
              <div key={c.id} className="flex flex-col gap-2">
                {c.messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      m.authorType === "STAFF"
                        ? "self-start bg-violet-950/60 text-mist-200"
                        : "self-end bg-ink-800 text-mist-200"
                    )}
                  >
                    <p className="text-[11px] text-mist-500">
                      {m.authorType === "STAFF" ? `${m.authorName} · Urban Night Lift` : fr ? "Vous" : "You"}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
            ))}

          {!hasThread && (
            <select
              className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {fr ? c.fr : c.en}
                </option>
              ))}
            </select>
          )}

          <textarea
            className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 text-sm"
            rows={3}
            placeholder={fr ? "Dites-nous ce qui s'est passé…" : "Tell us what happened…"}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          {error && <p className="text-xs text-restricted">{error}</p>}

          <Button size="sm" disabled={busy || message.trim().length < 3} onClick={send}>
            <Send className="h-4 w-4" /> {fr ? "Envoyer" : "Send"}
          </Button>

          <p className="text-[11px] text-mist-500">
            {fr
              ? "Nous répondons pendant nos heures de nuit (18h–4h). Vous verrez la réponse ici."
              : "We reply during our night hours (6 PM–4 AM). Our answer appears right here."}
          </p>
        </div>
      )}
    </section>
  );
}
