"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Send, MoonStar } from "lucide-react";

import { Logo } from "@/components/shared/Logo";

/**
 * What a restaurant sees when they tap the link in our WhatsApp message.
 *
 * Written for somebody standing next to a fire at 11 PM holding a phone in one
 * hand. That constraint decides everything on this page:
 *
 *  - **No login.** They would not make an account, and the signed link already
 *    proves which business this is.
 *  - **Two ways to answer, both one gesture.** Tap the dishes that ran out, or
 *    type a sentence — "plus de poisson braisé" — and let it be read. Kitchens
 *    differ and neither should be the only way.
 *  - **French first.** Most kitchens here answer in French, and this page exists
 *    to be answered rather than admired.
 *  - **It says thank you and stops.** There is nothing else to do here, and
 *    anything more would be us taking their time for our benefit.
 *
 * The payoff is the customer's screen: a dish they cannot have stops being
 * offered within a minute. Everywhere else in this market you find that out
 * when the rider arrives.
 */

interface Item {
  id: string;
  name: string;
  nameFr: string | null;
  soldOut: boolean;
}

export function MerchantAvailability({ token }: { token: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [merchantName, setMerchantName] = useState("");
  const [dead, setDead] = useState(false);
  const [soldOut, setSoldOut] = useState<Set<string>>(new Set());
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/m/${token}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          setDead(true);
          return;
        }
        const data = await r.json();
        setMerchantName(data.merchantName ?? "");
        setItems(data.items ?? []);
        setSoldOut(new Set((data.items ?? []).filter((i: Item) => i.soldOut).map((i: Item) => i.id)));
      })
      .catch(() => setDead(true));
  }, [token]);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setUnmatched([]);
    try {
      const res = await fetch(`/api/m/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setDone(data.error ?? "Ça n'a pas marché. Réessayez.");
        return;
      }
      setUnmatched(data.unmatched ?? []);
      setDone("Merci ! C'est à jour.");
    } catch {
      setDone("Connexion impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  if (dead) {
    return (
      <Frame>
        <p className="text-sm leading-relaxed text-mist-300">
          Ce lien a expiré. Nous vous en enverrons un autre ce soir — ou répondez simplement à notre
          message WhatsApp.
        </p>
      </Frame>
    );
  }

  if (done) {
    return (
      <Frame>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-safe/15">
            <Check className="h-7 w-7 text-safe" />
          </span>
          <h1 className="font-display text-xl font-bold text-mist-100">{done}</h1>
          <p className="text-sm text-mist-400">
            Vos clients voient maintenant ce que vous avez vraiment.
          </p>
          {unmatched.length > 0 && (
            <p className="mt-2 rounded-xl border border-caution/40 bg-caution/10 p-3 text-xs leading-relaxed text-caution">
              Nous n&apos;avons pas trouvé « {unmatched.join(" », « ")} » dans votre liste. Dites-le
              nous sur WhatsApp et nous l&apos;ajoutons.
            </p>
          )}
        </div>
      </Frame>
    );
  }

  if (!items) {
    return (
      <Frame>
        <p className="text-sm text-mist-400">Chargement…</p>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-display text-xl font-bold text-mist-100">
            {merchantName || "Votre restaurant"} — qu&apos;avez-vous ce soir ?
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-mist-400">
            Touchez ce qui est <strong>fini</strong>. Ce qui reste allumé, vos clients peuvent le
            commander.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const off = soldOut.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  setSoldOut((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })
                }
                className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
                  off
                    ? "border-ink-700 bg-ink-900 text-mist-600 line-through"
                    : "border-safe/40 bg-safe/10 text-mist-100"
                }`}
              >
                <span>{item.nameFr || item.name}</span>
                <span className={`text-xs font-semibold ${off ? "text-mist-600" : "text-safe"}`}>
                  {off ? "Fini" : "Disponible"}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => send({ soldOutIds: [...soldOut] })}
          className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Envoyer
        </button>

        {/* The other way, for whoever would rather type than tap. */}
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
          <p className="text-xs text-mist-400">Ou écrivez-le simplement :</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="« on a tout » · « plus de poisson braisé »"
              className="w-full bg-transparent text-sm text-mist-100 placeholder:text-mist-600 focus:outline-none"
            />
            <button
              type="button"
              disabled={busy || reply.trim().length < 2}
              onClick={() => send({ replyText: reply })}
              className="shrink-0 text-violet-300 disabled:opacity-40"
              aria-label="Envoyer"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <Logo />
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-violet-300">
          <MoonStar className="h-3.5 w-3.5" /> Ce soir
        </span>
      </div>
      {children}
      <p className="mt-auto pt-6 text-center text-[11px] text-mist-600">
        Urban Night Lift · Yaoundé · 18h – 4h
      </p>
    </main>
  );
}
