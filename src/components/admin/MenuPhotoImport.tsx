"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Check, X } from "lucide-react";

/**
 * Photograph a menu board, tick the rows, publish.
 *
 * The food page only shows businesses somebody confirmed, which means it is
 * empty until the catalogue is filled — and filling it by typing forty dishes
 * and prices per restaurant is why it would stay empty. This is the tool that
 * makes an evening's work out of a quarter's.
 *
 * **Every row starts ticked but nothing is published until the button is
 * pressed.** These prices go straight to customers, and this project has twice
 * paid for a catalogue that was filled without a human looking: 959 defunct
 * businesses imported from a map, and three restaurants invented outright. A
 * price read off a photograph in bad light is the same mistake wearing a
 * different hat.
 *
 * Editable in place, because the fix for a misread price is to correct it, not
 * to throw the whole photograph away.
 */

interface DraftItem {
  name: string;
  nameFr: string | null;
  priceXaf: number | null;
  unit: string | null;
  category: string | null;
  description: string | null;
}

export function MenuPhotoImport({
  merchantId,
  merchantName,
  onSaved,
}: {
  merchantId: string;
  merchantName: string;
  onSaved?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "read" | "save" | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File) {
    setError(null);
    setNote(null);
    setItems([]);
    setBusy("upload");

    try {
      // The existing signed-upload flow, unchanged — the photo goes to a private
      // bucket and only a short-lived signed URL ever reaches the model.
      const signed = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "merchant-menus", fileName: file.name }),
      }).then((r) => r.json());

      if (!signed?.signedUrl) {
        setError(signed?.error ?? "Couldn't start the upload.");
        return;
      }

      const put = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) {
        setError("The photo didn't upload. Check the connection and try again.");
        return;
      }

      setBusy("read");
      const read = await fetch(`/api/merchants/${merchantId}/menu-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoPath: signed.path }),
      }).then((r) => r.json());

      setNote(read.note ?? null);
      setItems(read.items ?? []);
      setKeep(new Set((read.items ?? []).map((_: DraftItem, i: number) => i)));
    } catch {
      setError("Something went wrong reading that photo.");
    } finally {
      setBusy(null);
    }
  }

  function edit(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  async function save() {
    const chosen = items.filter((_, i) => keep.has(i));
    if (chosen.length === 0) return;
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/merchants/${merchantId}/menu-photo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: chosen }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That didn't save.");
        return;
      }
      setNote(`${data.saved} item${data.saved === 1 ? "" : "s"} published for ${merchantName}.`);
      setItems([]);
      onSaved?.();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  const chosenCount = items.filter((_, i) => keep.has(i)).length;

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-950 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
          className="flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-600/15 px-3 py-1.5 text-xs font-semibold text-violet-300 disabled:opacity-50"
        >
          {busy === "upload" || busy === "read" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
          {busy === "upload" ? "Uploading…" : busy === "read" ? "Reading…" : "Photograph their menu"}
        </button>
        <span className="text-xs text-mist-500">
          Their price board or printed menu. You check every row before anything goes live.
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          // Opens the camera directly on a phone, which is where this is used —
          // standing in front of the board with the owner.
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className="mt-2 text-xs text-restricted">{error}</p>}
      {note && <p className="mt-2 text-xs text-mist-400">{note}</p>}

      {items.length > 0 && (
        <>
          <ul className="mt-3 flex flex-col gap-1">
            {items.map((it, i) => {
              const on = keep.has(i);
              return (
                <li
                  key={i}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                    on ? "border-ink-700 bg-ink-900" : "border-ink-800 opacity-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setKeep((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      on ? "border-safe bg-safe/20 text-safe" : "border-ink-600 text-mist-500"
                    }`}
                  >
                    {on ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  </button>
                  <input
                    value={it.name}
                    onChange={(e) => edit(i, { name: e.target.value })}
                    className="min-w-0 flex-1 bg-transparent text-sm text-mist-100 focus:outline-none"
                  />
                  <input
                    value={it.category ?? ""}
                    onChange={(e) => edit(i, { category: e.target.value })}
                    placeholder="group"
                    className="w-24 bg-transparent text-right text-xs text-mist-500 focus:outline-none"
                  />
                  <input
                    value={it.priceXaf ?? ""}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/\D/g, ""));
                      edit(i, { priceXaf: Number.isFinite(n) && n > 0 ? n : null });
                    }}
                    placeholder="—"
                    inputMode="numeric"
                    className="w-20 bg-transparent text-right text-sm font-semibold text-mist-100 focus:outline-none"
                  />
                  <span className="text-xs text-mist-500">XAF</span>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={save}
            disabled={busy !== null || chosenCount === 0}
            className="mt-3 flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Publish {chosenCount} item{chosenCount === 1 ? "" : "s"}
          </button>
        </>
      )}
    </div>
  );
}
