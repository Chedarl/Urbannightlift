"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ClipboardPaste, Loader2, Check, X } from "lucide-react";

import { Button } from "@/components/shared/Button";

/**
 * A business into the catalogue in fifteen seconds.
 *
 * Both pages that browse the catalogue are correct and empty, and everything
 * built to fill them assumes the merchant is already in the system. Getting
 * them in is the typing nobody does.
 *
 * Two ways in, both from what you are already doing:
 *
 *  - **Screenshot** their Instagram, Facebook or TikTok page while you are
 *    looking at it deciding whether they are real.
 *  - **Paste** the WhatsApp conversation you had when you called to check.
 *
 * **Every field stays editable and nothing saves until you press the button.**
 * That is not ceremony — at fifteen seconds a business it is very easy to stop
 * reading, and a wrong phone number sends a rider to nobody. The phone field is
 * called out for that reason.
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

const field =
  "w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 placeholder:text-mist-600 focus:border-violet-500 focus:outline-none";

export function MerchantCapture() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"upload" | "read" | "save" | null>(null);
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function edit(patch: Partial<Draft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function read(body: Record<string, unknown>) {
    setBusy("read");
    setError(null);
    try {
      const res = await fetch("/api/admin/merchant-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setNote(data.note ?? data.error ?? null);
      setDraft(data.draft ?? null);
    } catch {
      setError("Something went wrong reading that.");
    } finally {
      setBusy(null);
    }
  }

  async function onPick(file: File) {
    setError(null);
    setNote(null);
    setDraft(null);
    setBusy("upload");
    try {
      // The existing signed-upload flow, unchanged — the screenshot goes to a
      // private bucket and only a short-lived signed URL reaches the model.
      const signed = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "merchant-captures", fileName: file.name }),
      }).then((r) => r.json());

      if (!signed?.signedUrl) {
        setError(signed?.error ?? "Couldn't start the upload.");
        setBusy(null);
        return;
      }
      const put = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) {
        setError("The screenshot didn't upload. Check the connection and try again.");
        setBusy(null);
        return;
      }
      await read({ photoPath: signed.path });
    } catch {
      setError("Something went wrong reading that screenshot.");
      setBusy(null);
    }
  }

  async function save() {
    if (!draft?.merchantName || !draft.category || !draft.whatsappNumber || !draft.address) return;
    setBusy("save");
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
        setBusy(null);
        return;
      }
      setNote(`${draft.merchantName} added. It stays unverified until you confirm it.`);
      setDraft(null);
      setThread("");
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  const missing = draft
    ? ["merchantName", "category", "whatsappNumber", "address"].filter(
        (k) => !draft[k as keyof Draft]
      )
    : [];

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Camera className="h-3.5 w-3.5" /> Capture a business
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-violet-700/40 bg-violet-900/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-violet-300">Capture a business</p>
        <button type="button" onClick={() => setOpen(false)} className="text-mist-500 hover:text-mist-200">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-mist-400">
        Screenshot their Instagram, Facebook or TikTok page — or paste the WhatsApp
        conversation you had when you called them.
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          {busy === "upload" || busy === "read" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
          {busy === "upload" ? "Uploading…" : busy === "read" ? "Reading…" : "Screenshot"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => read({ thread })}
          disabled={busy !== null || thread.trim().length < 20}
        >
          <ClipboardPaste className="h-3.5 w-3.5" /> Read the conversation
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
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
      {note && <p className="mt-2 text-xs text-mist-400">{note}</p>}

      {draft && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-ink-700 bg-ink-950 p-2.5">
          <input
            value={draft.merchantName ?? ""}
            onChange={(e) => edit({ merchantName: e.target.value })}
            placeholder="Business name"
            className={field}
          />
          <div className="flex gap-2">
            <select
              value={draft.category ?? ""}
              onChange={(e) => edit({ category: e.target.value || null })}
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
              onChange={(e) => edit({ subcategory: e.target.value || null })}
              placeholder="braise, snack…"
              className={field}
            />
          </div>
          <div className="flex gap-2">
            <input
              value={draft.whatsappNumber ?? ""}
              onChange={(e) => edit({ whatsappNumber: e.target.value || null })}
              placeholder="WhatsApp number"
              inputMode="tel"
              className={field}
            />
            <input
              value={draft.phone ?? ""}
              onChange={(e) => edit({ phone: e.target.value || null })}
              placeholder="Other phone"
              inputMode="tel"
              className={field}
            />
          </div>
          <input
            value={draft.address ?? ""}
            onChange={(e) => edit({ address: e.target.value || null })}
            placeholder="Where it is — street, landmark"
            className={field}
          />
          <div className="flex gap-2">
            <input
              value={draft.neighbourhood ?? ""}
              onChange={(e) => edit({ neighbourhood: e.target.value || null })}
              placeholder="Quartier"
              className={field}
            />
            <input
              value={draft.openingHours ?? ""}
              onChange={(e) => edit({ openingHours: e.target.value || null })}
              placeholder="Hours"
              className={field}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {/*
              Three states, shown as two buttons that can both be off. "We were
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
                onClick={() => edit({ [key]: draft[key] === true ? null : true } as Partial<Draft>)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  draft[key] === true
                    ? "bg-safe/15 text-safe"
                    : "border border-ink-600 text-mist-500"
                }`}
              >
                {label}
                {draft[key] === null ? " — not stated" : ""}
              </button>
            ))}
          </div>

          {draft.products.length > 0 && (
            <p className="text-[11px] text-mist-500">
              {draft.products.length} price{draft.products.length === 1 ? "" : "s"} were visible too —
              add them from the products panel once this is saved.
            </p>
          )}

          {missing.length > 0 && (
            <p className="text-[11px] text-caution">
              Still needed before this can save: {missing.join(", ")}.
            </p>
          )}

          <Button size="sm" onClick={save} disabled={busy !== null || missing.length > 0}>
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Add {draft.merchantName || "this business"}
          </Button>
          <p className="text-[10px] leading-relaxed text-mist-600">
            It saves unverified, so nothing reaches a customer until you confirm it —
            same as every other way in.
          </p>
        </div>
      )}
      {pending && <p className="mt-1 text-[11px] text-mist-600">Refreshing…</p>}
    </div>
  );
}
