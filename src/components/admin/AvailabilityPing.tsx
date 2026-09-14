"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Radio, Loader2, Check, ClipboardPaste } from "lucide-react";

import { formatXaf } from "@/lib/utils";

/**
 * Ask a restaurant what is on the fire, and put their answer on the menu.
 *
 * The thing no competitor here does. Everywhere else you order a dish and find
 * out it ran out when the rider arrives — the restaurant knew all along, and
 * nobody asked, because asking is a phone call and a phone call does not scale
 * past four merchants a night.
 *
 * **Said plainly, because it decides the shape of this component: a `wa.me`
 * ping cannot receive a reply.** It opens WhatsApp with the message typed, and
 * the answer lands in the phone that sent it. So there are two ways back:
 *
 *  - the merchant taps the signed link in the message and marks their own list,
 *    which needs nobody here at all;
 *  - or they reply in the chat, and that reply is pasted into the box below.
 *
 * The paste is read first and applied second. Staff see which dishes the model
 * thinks went off before anything changes on a customer's screen — the same
 * two-step every other model-fed surface in this product uses, for the same
 * reason.
 */

interface Change {
  itemId: string;
  name: string;
  soldOut: boolean;
}

/** A dish they named that is not on their list. Offered, never auto-created. */
interface NewRow {
  name: string;
  priceXaf: number | null;
}

export function AvailabilityPing({
  merchantId,
  merchantName,
  checkedAt,
  itemCount,
}: {
  merchantId: string;
  merchantName: string;
  checkedAt: string | null;
  itemCount: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pingId, setPingId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  /** Dishes they named that we do not stock yet, offered for ticking. */
  const [newItems, setNewItems] = useState<NewRow[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);

  async function ping() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/merchants/${merchantId}/ping`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error ?? "Couldn't start that.");
        return;
      }
      setPingId(data.pingId);
      setOpen(true);
      // Their WhatsApp, with the message and the link already typed. A person
      // presses send, because click-to-chat is what we have until Meta approves
      // the Cloud API — at which point this same button sends it for you.
      window.open(data.waLink, "_blank", "noopener");
    } catch {
      setNote("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function readReply() {
    setBusy(true);
    setNote(null);
    setChanges(null);
    try {
      const res = await fetch(`/api/admin/merchants/${merchantId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyText: reply, pingId }),
      });
      const data = await res.json();
      if (data.error) {
        setNote(data.error);
        return;
      }
      setChanges(data.changes ?? []);
      setUnmatched(data.unmatched ?? []);
      const offered: NewRow[] = data.newItems ?? [];
      setNewItems(offered);
      // Everything is ticked to begin with. On a first reply this list *is* the
      // menu they just gave us, and asking somebody to tick eight rows they
      // already read is friction for its own sake — untick what is wrong.
      setPicked(new Set(offered.map((_, i) => i)));
      if ((data.changes ?? []).length === 0 && offered.length === 0) {
        setNote(
          data.note
            ? `Nothing to change. It read: "${data.note}"`
            : "Nothing in that reply names a dish we can act on."
        );
      }
    } catch {
      setNote("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!changes) return;
    setBusy(true);
    try {
      const adding = newItems.filter((_, i) => picked.has(i));
      const res = await fetch(`/api/admin/merchants/${merchantId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apply: true,
          changes,
          // Only what a person ticked. The reading is never trusted to write.
          newItems: adding,
          replyText: reply,
          pingId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error ?? "That didn't apply.");
        return;
      }
      const added = Number(data.added ?? 0);
      setNote(
        added > 0
          ? `Updated — ${added} item${added === 1 ? "" : "s"} added to their menu, and customers see it now.`
          : "Updated — customers see it now."
      );
      setChanges(null);
      setNewItems([]);
      setPicked(new Set());
      setReply("");
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const freshness = checkedAt ? ago(checkedAt) : null;

  return (
    <div className="mt-2 rounded-lg border border-ink-700 bg-ink-950 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={ping}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-600/15 px-2.5 py-1 text-xs font-semibold text-violet-300 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
          {/* A business with nothing listed gets asked a different question, and
              their answer becomes the menu. Refusing to ask was the dead end. */}
          {itemCount === 0 ? "Ask what they sell" : "Ask what they have"}
        </button>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1 text-xs text-mist-400 hover:text-mist-200"
          >
            <ClipboardPaste className="h-3.5 w-3.5" /> Paste their reply
          </button>
        )}
        <span className="text-xs text-mist-500">
          {itemCount === 0
            ? "No menu yet — one reply builds it."
            : freshness
              ? `Confirmed ${freshness}`
              : "Never confirmed"}
        </span>
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            placeholder={
              itemCount === 0
                ? `What ${merchantName} replied — "gâteau chocolat 5000, croissant 500"…`
                : `What ${merchantName} replied — "plus de poisson braisé", "on a tout"…`
            }
            className="w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-xs text-mist-100 placeholder:text-mist-600 focus:border-violet-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={readReply}
              disabled={busy || reply.trim().length < 2}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1 text-xs text-mist-300 disabled:opacity-40"
            >
              Read it
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-mist-500 hover:text-mist-300"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* What it made of the sentence, before anything changes. */}
      {changes && (changes.length > 0 || newItems.length > 0) && (
        <div className="mt-2 flex flex-col gap-1.5">
          {changes.map((c) => (
            <p key={c.itemId} className="text-xs">
              <span className={c.soldOut ? "text-caution" : "text-safe"}>
                {c.soldOut ? "Sold out" : "Available"}
              </span>{" "}
              <span className="text-mist-300">{c.name}</span>
            </p>
          ))}
          {/*
            Dishes they named that we do not sell yet. Still never created by
            reading — these are ticked by a person, which is the same rule the
            changes above follow. What is new is that they are offered at all:
            before, an unmatched name was a sentence telling you to go and type
            it somewhere else, which is why empty merchants stayed empty.
          */}
          {newItems.length > 0 && (
            <div className="rounded-lg border border-gold-400/30 bg-gold-400/5 p-2">
              <p className="text-xs text-gold-200">
                Not on their list yet. Ticked rows are added to their menu.
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {newItems.map((n, i) => (
                  <li key={`${n.name}-${i}`}>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-mist-200">
                      <input
                        type="checkbox"
                        checked={picked.has(i)}
                        onChange={(e) => {
                          const next = new Set(picked);
                          if (e.target.checked) next.add(i);
                          else next.delete(i);
                          setPicked(next);
                        }}
                      />
                      <span className="flex-1">{n.name}</span>
                      <span className={n.priceXaf != null ? "font-semibold text-gold-300" : "text-mist-500"}>
                        {n.priceXaf != null ? formatXaf(n.priceXaf) : "no price given"}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs leading-relaxed text-mist-500">
                A price is only shown when they actually said one — never guessed. Add the rest from
                the products panel.
              </p>
            </div>
          )}
          {unmatched.length > 0 && newItems.length === 0 && (
            <p className="text-xs leading-relaxed text-mist-500">
              Not on their list: {unmatched.join(", ")} — add it from the products panel if they
              really sell it. Nothing is created automatically.
            </p>
          )}
          <button
            type="button"
            onClick={apply}
            disabled={busy}
            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-safe/40 bg-safe/10 px-2.5 py-1 text-xs font-semibold text-safe disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />{" "}
            {picked.size > 0 ? `Apply, and add ${picked.size}` : "Apply to the menu"}
          </button>
        </div>
      )}

      {note && <p className="mt-2 text-xs leading-relaxed text-mist-400">{note}</p>}
    </div>
  );
}

/** "12 min ago" rather than a timestamp — this is a freshness reading. */
function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
