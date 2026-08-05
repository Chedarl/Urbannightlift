"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

/**
 * Permanently removing a rehearsal record.
 *
 * Deliberately awkward. This is the only control in the product that destroys
 * data with no way back — orders, payments, proofs and history go with the row —
 * and the owner chose that behaviour knowing it. So the interface does the one
 * thing an interface can do about an irreversible action: **make it impossible
 * to take by accident.**
 *
 *  - It only renders while test mode is on and only for the owner. The server
 *    checks both again, because a hidden button is not a permission.
 *  - It states what will be destroyed, counted, before anything happens.
 *  - The row's own name has to be typed. Not "yes", not a checkbox — the name,
 *    because typing it is the only confirmation that cannot be given absently.
 *
 * When test mode goes off, this disappears and the endpoint starts refusing
 * everybody, including the owner. Going live is what closes it.
 */
export function DangerDelete({
  url,
  name,
  what,
  counts,
}: {
  /** The endpoint that does it. Already gated OWNER + test mode server-side. */
  url: string;
  /** What has to be typed back. */
  name: string;
  /** "business" | "customer" — used in the sentences below. */
  what: string;
  /** What goes with it, so nothing is destroyed silently. */
  counts: { label: string; n: number }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const attached = counts.filter((c) => c.n > 0);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: typed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That didn't delete.");
        return;
      }
      setOpen(false);
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-restricted/40 px-2.5 py-1 text-[11px] font-semibold text-restricted/80 hover:bg-restricted/10"
      >
        <Trash2 className="h-3.5 w-3.5" /> Delete permanently
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-restricted/40 bg-restricted/5 p-2.5">
      <p className="text-[11px] leading-relaxed text-restricted">
        This deletes <strong>{name}</strong> for good.
        {attached.length > 0 && (
          <>
            {" "}
            It also destroys {attached.map((c) => `${c.n} ${c.label}${c.n === 1 ? "" : "s"}`).join(", ")}.
          </>
        )}{" "}
        There is no undo.
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={`Type the ${what}'s name to confirm`}
        className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-xs text-mist-100 placeholder:text-mist-600 focus:border-restricted focus:outline-none"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={remove}
          disabled={!matches || busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-restricted/50 bg-restricted/15 px-2.5 py-1 text-[11px] font-semibold text-restricted disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Delete for good
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
          className="text-[11px] text-mist-400 hover:text-mist-200"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-restricted">{error}</p>}
    </div>
  );
}
