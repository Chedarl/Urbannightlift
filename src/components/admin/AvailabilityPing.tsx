"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Radio, Loader2, Check, ClipboardPaste } from "lucide-react";

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
      if ((data.changes ?? []).length === 0) {
        setNote(
          data.note
            ? `Nothing to change. It read: "${data.note}"`
            : "Nothing in that reply names a dish on their list."
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
      const res = await fetch(`/api/admin/merchants/${merchantId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true, changes, replyText: reply, pingId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error ?? "That didn't apply.");
        return;
      }
      setNote(`Updated — customers see it now.`);
      setChanges(null);
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
          disabled={busy || itemCount === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-600/15 px-2.5 py-1 text-[11px] font-semibold text-violet-300 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
          Ask what they have
        </button>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1 text-[11px] text-mist-400 hover:text-mist-200"
          >
            <ClipboardPaste className="h-3.5 w-3.5" /> Paste their reply
          </button>
        )}
        <span className="text-[11px] text-mist-500">
          {itemCount === 0
            ? "No items listed yet — nothing to ask about."
            : freshness
              ? `Confirmed ${freshness}`
              : "Never confirmed"}
        </span>
      </div>

      {open && itemCount > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            placeholder={`What ${merchantName} replied — "plus de poisson braisé", "on a tout"…`}
            className="w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-xs text-mist-100 placeholder:text-mist-600 focus:border-violet-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={readReply}
              disabled={busy || reply.trim().length < 2}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1 text-[11px] text-mist-300 disabled:opacity-40"
            >
              Read it
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-mist-500 hover:text-mist-300"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* What it made of the sentence, before anything changes. */}
      {changes && changes.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {changes.map((c) => (
            <p key={c.itemId} className="text-[11px]">
              <span className={c.soldOut ? "text-caution" : "text-safe"}>
                {c.soldOut ? "Sold out" : "Available"}
              </span>{" "}
              <span className="text-mist-300">{c.name}</span>
            </p>
          ))}
          {unmatched.length > 0 && (
            <p className="text-[11px] leading-relaxed text-mist-500">
              Not on their list: {unmatched.join(", ")} — add it from the products panel if they
              really sell it. Nothing is created automatically.
            </p>
          )}
          <button
            type="button"
            onClick={apply}
            disabled={busy}
            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-safe/40 bg-safe/10 px-2.5 py-1 text-[11px] font-semibold text-safe disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> Apply to the menu
          </button>
        </div>
      )}

      {note && <p className="mt-2 text-[11px] leading-relaxed text-mist-400">{note}</p>}
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
