"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ClipboardPaste, Loader2, Check, X, Trash2 } from "lucide-react";

import { Button } from "@/components/shared/Button";
import { downscaleImage } from "@/lib/uploads/downscale";

/**
 * A business into the catalogue in fifteen seconds — several at a time.
 *
 * Both pages that browse the catalogue are correct and empty, and everything
 * built to fill them assumes the merchant is already in the system. Getting
 * them in is the typing nobody does.
 *
 * Two ways in, both from what you are already doing:
 *
 *  - **Screenshots** of their Instagram, Facebook or TikTok pages, taken while
 *    you sit there deciding whether each is real. Pick as many at once as you
 *    like: the real workflow is an evening of scrolling, not one business.
 *  - **Paste** the WhatsApp conversation you had when you called to check.
 *
 * Each capture becomes its own draft row, read one at a time so a single bad
 * photo cannot take the batch down with it.
 *
 * **Every field stays editable and nothing saves until you press the button.**
 * That is not ceremony — at fifteen seconds a business it is very easy to stop
 * reading, and a wrong phone number sends a rider to nobody.
 */

interface Draft {
  merchantName: string | null;
  category: string | null;
  subcategory: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  neighbourhood: string | null;
  address: string | null;
  openingHours: string | null;
  nightOpen: boolean | null;
  open24h: boolean | null;
  socialUrl: string | null;
  products: { name: string; priceXaf: number | null }[];
}

const CATEGORIES = ["FOOD", "PHARMACY", "GROCERY", "GENERAL_STORE", "OTHER"];
const REQUIRED: (keyof Draft)[] = ["merchantName", "category", "whatsappNumber", "address"];

const field =
  "w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 placeholder:text-mist-600 focus:border-violet-500 focus:outline-none";

export function MerchantCapture() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [thread, setThread] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function edit(index: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function drop(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  /** One capture in, one draft appended — or the reason it did not work. */
  async function read(body: Record<string, unknown>): Promise<string | null> {
    const res = await fetch("/api/admin/merchant-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.draft) {
      setDrafts((prev) => [...prev, data.draft]);
      return null;
    }
    // The provider's own sentence. This used to be a generic apology while the
    // real cause sat in a log on a different screen.
    return data.note ?? data.error ?? "Nothing came back.";
  }

  async function readThread() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const failed = await read({ thread });
      if (failed) setNote(failed);
      else setThread("");
    } catch {
      setError("Something went wrong reading that.");
    } finally {
      setBusy(false);
    }
  }

  /** Uploads and reads each picked file in turn. */
  async function onPick(files: File[]) {
    setError(null);
    setNote(null);
    setBusy(true);
    setProgress({ done: 0, total: files.length });

    const failures: string[] = [];

    for (const [i, original] of files.entries()) {
      try {
        // Shrunk before it leaves the phone: a 3 MB screenshot becomes a few
        // hundred kilobytes, which is the difference between this working on
        // mobile data and not.
        const file = await downscaleImage(original);

        const signed = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bucket: "merchant-captures", fileName: file.name }),
        }).then((r) => r.json());

        if (!signed?.signedUrl) {
          failures.push(signed?.error ?? "couldn't start the upload");
          continue;
        }

        const put = await fetch(signed.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) {
          failures.push("upload failed");
          continue;
        }

        const failed = await read({ photoPath: signed.path });
        if (failed) failures.push(failed);
      } catch {
        failures.push("something went wrong");
      } finally {
        setProgress({ done: i + 1, total: files.length });
      }
    }

    setBusy(false);
    setProgress(null);
    // One line per distinct reason, not one per file — ten identical failures
    // are one problem.
    if (failures.length > 0) setNote([...new Set(failures)].join(" · "));
  }

  async function save(index: number) {
    const draft = drafts[index];
    if (REQUIRED.some((k) => !draft[k])) return;
    setSavingIndex(index);
    setError(null);
    try {
      const res = await fetch("/api/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantName: draft.merchantName,
          category: draft.category,
          subcategory: draft.subcategory,
          whatsappNumber: draft.whatsappNumber,
          phone: draft.phone,
          address: draft.address,
          neighbourhood: draft.neighbourhood,
          openingHours: draft.openingHours,
          // Tri-state on the way in becomes a real boolean here, defaulting to
          // closed — the safe direction, since an unverified merchant marked
          // night-open would be offered to customers before anyone confirmed it.
          nightOpen: draft.nightOpen === true,
          open24h: draft.open24h === true,
          socialUrl: draft.socialUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That didn't save.");
        return;
      }
      setNote(`${draft.merchantName} added. It stays unverified until you confirm it.`);
      drop(index);
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSavingIndex(null);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Camera className="h-3.5 w-3.5" /> Capture a business
      </Button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-violet-700/40 bg-violet-900/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-violet-300">Capture a business</p>
        <button type="button" onClick={() => setOpen(false)} className="text-mist-500 hover:text-mist-200">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-mist-400">
        Screenshot their Instagram, Facebook or TikTok page — pick as many as you like at
        once — or paste the WhatsApp conversation you had when you called them.
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy && progress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          {progress ? `Reading ${progress.done}/${progress.total}…` : "Screenshots"}
        </Button>
        <Button size="sm" variant="outline" onClick={readThread} disabled={busy || thread.trim().length < 20}>
          <ClipboardPaste className="h-3.5 w-3.5" /> Read the conversation
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          // Several at a time, because the real workflow is an evening of
          // scrolling rather than one business.
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length > 0) onPick(picked);
            e.target.value = "";
          }}
        />
      </div>

      <textarea
        value={thread}
        onChange={(e) => setThread(e.target.value)}
        rows={3}
        placeholder="Paste a WhatsApp conversation here…"
        className={`${field} mt-2 resize-y`}
      />

      {error && <p className="mt-2 text-xs text-restricted">{error}</p>}
      {note && <p className="mt-2 text-xs leading-relaxed text-mist-400">{note}</p>}

      {drafts.map((draft, index) => {
        const missing = REQUIRED.filter((k) => !draft[k]);
        return (
          <div
            key={index}
            className="mt-3 flex flex-col gap-2 rounded-lg border border-ink-700 bg-ink-950 p-2.5"
          >
            <div className="flex items-center gap-2">
              <input
                value={draft.merchantName ?? ""}
                onChange={(e) => edit(index, { merchantName: e.target.value })}
                placeholder="Business name"
                className={field}
              />
              <button
                type="button"
                onClick={() => drop(index)}
                className="shrink-0 text-mist-500 hover:text-restricted"
                aria-label="Discard this one"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-2">
              <select
                value={draft.category ?? ""}
                onChange={(e) => edit(index, { category: e.target.value || null })}
                className={field}
              >
                <option value="">Category…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace("_", " ").toLowerCase()}
                  </option>
                ))}
              </select>
              <input
                value={draft.subcategory ?? ""}
                onChange={(e) => edit(index, { subcategory: e.target.value || null })}
                placeholder="braise, snack…"
                className={field}
              />
            </div>

            <div className="flex gap-2">
              <input
                value={draft.whatsappNumber ?? ""}
                onChange={(e) => edit(index, { whatsappNumber: e.target.value || null })}
                placeholder="WhatsApp number"
                inputMode="tel"
                className={field}
              />
              <input
                value={draft.phone ?? ""}
                onChange={(e) => edit(index, { phone: e.target.value || null })}
                placeholder="Other phone"
                inputMode="tel"
                className={field}
              />
            </div>

            <input
              value={draft.address ?? ""}
              onChange={(e) => edit(index, { address: e.target.value || null })}
              placeholder="Where it is — street, landmark"
              className={field}
            />

            <div className="flex gap-2">
              <input
                value={draft.neighbourhood ?? ""}
                onChange={(e) => edit(index, { neighbourhood: e.target.value || null })}
                placeholder="Quartier"
                className={field}
              />
              <input
                value={draft.openingHours ?? ""}
                onChange={(e) => edit(index, { openingHours: e.target.value || null })}
                placeholder="Hours"
                className={field}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {/*
                Three states shown as two buttons that can both be off. "We were
                not told" is a real answer and must not be silently turned into
                "closed at night" — that is the only time we trade.
              */}
              {(
                [
                  ["nightOpen", "Open at night"],
                  ["open24h", "24 hours"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    edit(index, { [key]: draft[key] === true ? null : true } as Partial<Draft>)
                  }
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    draft[key] === true ? "bg-safe/15 text-safe" : "border border-ink-600 text-mist-500"
                  }`}
                >
                  {label}
                  {draft[key] === null ? " — not stated" : ""}
                </button>
              ))}
            </div>

            {draft.products.length > 0 && (
              <p className="text-[11px] text-mist-500">
                {draft.products.length} price{draft.products.length === 1 ? "" : "s"} were visible
                too — add them from the products panel once this is saved.
              </p>
            )}

            {missing.length > 0 && (
              <p className="text-[11px] text-caution">
                Still needed before this can save: {missing.join(", ")}.
              </p>
            )}

            <Button
              size="sm"
              onClick={() => save(index)}
              disabled={savingIndex !== null || missing.length > 0}
            >
              {savingIndex === index ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Add {draft.merchantName || "this business"}
            </Button>
          </div>
        );
      })}

      {drafts.length > 0 && (
        <p className="mt-2 text-[10px] leading-relaxed text-mist-600">
          Each saves unverified, so nothing reaches a customer until you confirm it — same as
          every other way in.
        </p>
      )}
      {pending && <p className="mt-1 text-[11px] text-mist-600">Refreshing…</p>}
    </div>
  );
}
