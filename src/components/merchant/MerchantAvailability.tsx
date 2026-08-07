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
 *  - **French first, but not French only.** Most kitchens here answer in
 *    French, so that is the default — but Cameroon is bilingual and an
 *    anglophone owner opening a French-only page is the same failure the
 *    customer app was pulled up on. It follows the browser and falls back to
 *    French, because there is no account here to carry a language preference.
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
  // No session, no cookie, no account — the browser's own language is the only
  // signal there is. French unless it plainly says otherwise.
  const [fr, setFr] = useState(true);
  useEffect(() => {
    setFr(!/^en\b/i.test(navigator.language || ""));
  }, []);

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
        setDone(data.error ?? (fr ? "Ça n'a pas marché. Réessayez." : "That didn't work. Try again."));
        return;
      }
      setUnmatched(data.unmatched ?? []);
      const added = Number(data.added ?? 0);
      setDone(
        added > 0
          ? fr
            ? `Merci ! ${added} article${added === 1 ? "" : "s"} ajouté${added === 1 ? "" : "s"} à votre carte.`
            : `Thank you! ${added} item${added === 1 ? "" : "s"} added to your menu.`
          : fr
            ? "Merci ! C'est à jour."
            : "Thank you! It's updated."
      );
    } catch {
      setDone(fr ? "Connexion impossible. Réessayez." : "Couldn't connect. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (dead) {
    return (
      <Frame fr={fr}>
        <p className="text-sm leading-relaxed text-mist-300">
          {fr
            ? "Ce lien a expiré. Nous vous en enverrons un autre ce soir — ou répondez simplement à notre message WhatsApp."
            : "This link has expired. We'll send another tonight — or just reply to our WhatsApp message."}
        </p>
      </Frame>
    );
  }

  if (done) {
    return (
      <Frame fr={fr}>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-safe/15">
            <Check className="h-7 w-7 text-safe" />
          </span>
          <h1 className="font-display text-xl font-bold text-mist-100">{done}</h1>
          <p className="text-sm text-mist-400">
            {fr
              ? "Vos clients voient maintenant ce que vous avez vraiment."
              : "Your customers now see what you actually have."}
          </p>
          {unmatched.length > 0 && (
            <p className="mt-2 rounded-xl border border-caution/40 bg-caution/10 p-3 text-xs leading-relaxed text-caution">
              {fr
                ? `Nous n'avons pas trouvé « ${unmatched.join(" », « ")} » dans votre liste. Dites-le nous sur WhatsApp et nous l'ajoutons.`
                : `We couldn't find "${unmatched.join('", "')}" on your list. Tell us on WhatsApp and we'll add it.`}
            </p>
          )}
        </div>
      </Frame>
    );
  }

  if (!items) {
    return (
      <Frame fr={fr}>
        <p className="text-sm text-mist-400">{fr ? "Chargement…" : "Loading…"}</p>
      </Frame>
    );
  }

  /*
   * Nothing listed yet. This is the first ping, and their answer *is* the menu.
   *
   * The page used to be built entirely around a list they might not have, so a
   * newly verified business tapped the link and found an empty screen with a
   * Send button. The question changes instead: what do you sell, and for how
   * much. One reply and they have a page.
   */
  const empty = items.length === 0;

  return (
    <Frame fr={fr}>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-display text-xl font-bold text-mist-100">
            {merchantName || (fr ? "Votre restaurant" : "Your restaurant")} —{" "}
            {empty
              ? fr
                ? "que vendez-vous ?"
                : "what do you sell?"
              : fr
                ? "qu'avez-vous ce soir ?"
                : "what have you got tonight?"}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-mist-400">
            {empty ? (
              fr ? (
                <>
                  Écrivez vos plats et vos prix, séparés par des virgules. Nous les mettons sur
                  votre page tout de suite.
                </>
              ) : (
                <>
                  Write your dishes and their prices, separated by commas. We put them on your page
                  straight away.
                </>
              )
            ) : fr ? (
              <>
                Touchez ce qui est <strong>fini</strong>. Ce qui reste allumé, vos clients peuvent le
                commander.
              </>
            ) : (
              <>
                Tap whatever has <strong>run out</strong>. Anything still lit, your customers can
                order.
              </>
            )}
          </p>
        </div>

        <div className={`flex flex-col gap-2 ${empty ? "hidden" : ""}`}>
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
                <span>{(fr && item.nameFr) || item.name}</span>
                <span className={`text-xs font-semibold ${off ? "text-mist-600" : "text-safe"}`}>
                  {off ? (fr ? "Fini" : "Sold out") : fr ? "Disponible" : "Available"}
                </span>
              </button>
            );
          })}
        </div>

        {!empty && (
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ soldOutIds: [...soldOut] })}
            className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {fr ? "Envoyer" : "Send"}
          </button>
        )}

        {/* The other way, for whoever would rather type than tap — and the only
            way when there is no list yet to tap at. */}
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
          <p className="text-xs text-mist-400">
            {empty
              ? fr
                ? "Votre carte :"
                : "Your menu:"
              : fr
                ? "Ou écrivez-le simplement :"
                : "Or just write it:"}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={
                empty
                  ? fr
                    ? "« gâteau chocolat 5000, croissant 500 »"
                    : '"chocolate cake 5000, croissant 500"'
                  : fr
                    ? "« on a tout » · « plus de poisson braisé »"
                    : '"we have everything" · "no more fish"'
              }
              className="w-full bg-transparent text-sm text-mist-100 placeholder:text-mist-600 focus:outline-none"
            />
            <button
              type="button"
              disabled={busy || reply.trim().length < 2}
              onClick={() => send({ replyText: reply })}
              className="shrink-0 text-violet-300 disabled:opacity-40"
              aria-label={fr ? "Envoyer" : "Send"}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function Frame({ children, fr }: { children: React.ReactNode; fr: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <Logo />
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-violet-300">
          <MoonStar className="h-3.5 w-3.5" /> {fr ? "Ce soir" : "Tonight"}
        </span>
      </div>
      {children}
      <p className="mt-auto pt-6 text-center text-[11px] text-mist-600">
        {fr ? "Urban Night Lift · Yaoundé · 18h – 4h" : "Urban Night Lift · Yaoundé · 6 PM – 4 AM"}
      </p>
    </main>
  );
}
