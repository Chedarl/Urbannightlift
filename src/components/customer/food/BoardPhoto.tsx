"use client";

import { useState } from "react";
import { Camera, Loader2, Plus, AlertTriangle, Minus } from "lucide-react";

import type { DraftItem } from "@/lib/ai/menuPhoto";

/**
 * Photograph the board instead of typing what is on it.
 *
 * ## The problem this is actually solving
 *
 * The free-text food path ends in a textarea: *"2 poulets braisés, 1 jus
 * d'ananas"*. The person filling it in is standing in front of a chalkboard
 * with the dishes and prices written on it, on a phone, at night. Everything
 * they need to type is already in front of the camera.
 *
 * `readMenuPhoto` has read boards into structured rows since v34. It was wired
 * only to the admin importer, because that screen publishes prices to
 * strangers. This one publishes nothing: the rows come back to the person
 * looking at the board and go into their own order.
 *
 * ## Two rules
 *
 * **A price read off a board is an estimate, never a quote.** It fills the
 * goods estimate — what we expect the food to cost, which is what the spending
 * cap is for — and is labelled as an estimate on the way in. It is not the
 * delivery fee and is never presented as one.
 *
 * **A failed reading shows nothing.** No key, an unreadable photo, a timeout:
 * the textarea is left exactly as it was and they type, which is what they do
 * today. Nothing invents a dish.
 */
export function BoardPhoto({
  fr,
  accent,
  onAdd,
}: {
  fr: boolean;
  accent: string;
  /** The line of text to append, and what the ticked dishes are expected to cost. */
  onAdd: (text: string, estimateXaf: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<DraftItem[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** Keyed by row index, so two dishes with the same name stay distinct. */
  const [want, setWant] = useState<Record<number, number>>({});

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || file.size > 10 * 1024 * 1024) return;
    setBusy(true);
    setNote(null);
    setWant({});
    try {
      const mint = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "order-screenshots", fileName: file.name }),
      });
      if (!mint.ok) throw new Error();
      const { signedUrl, path } = await mint.json();

      const put = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error();

      const res = await fetch("/api/ai/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoPath: path }),
      });
      const d = await res.json();
      const items: DraftItem[] = Array.isArray(d.items) ? d.items : [];
      setRows(items.length > 0 ? items : null);
      setNote(typeof d.note === "string" ? d.note : null);
    } catch {
      // Upload failure, network failure and model failure land in the same
      // place: nothing to show, and the textarea below still works.
      setRows(null);
      setNote(fr ? "La lecture a échoué. Écrivez ce que vous voulez ci-dessous." : "Reading failed. Type what you want below.");
    } finally {
      setBusy(false);
    }
  }

  function bump(i: number, delta: number) {
    setWant((prev) => {
      const next = { ...prev };
      const now = (next[i] ?? 0) + delta;
      if (now <= 0) delete next[i];
      else next[i] = Math.min(now, 20);
      return next;
    });
  }

  const picked = Object.entries(want).map(([i, qty]) => ({ row: rows?.[Number(i)], qty }));
  const chosen = picked.filter((p) => p.row);
  const estimate = chosen.reduce((sum, p) => sum + (p.row!.priceXaf ?? 0) * p.qty, 0);
  const anyUnpriced = chosen.some((p) => p.row!.priceXaf == null);

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-800/50 p-3">
      {rows === null && (
        <>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-950">
            <span
              className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5"
              style={{ backgroundColor: accent, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {busy
                ? fr ? "Lecture du tableau…" : "Reading the board…"
                : fr ? "Photographier le tableau" : "Photograph the board"}
            </span>
            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={onFile} />
          </label>
          <p className="mt-2 text-xs text-mist-500">
            {fr
              ? "Devant l'ardoise ? Prenez-la en photo, cochez ce que vous voulez."
              : "Standing at the board? Photograph it and tick what you want."}
          </p>
        </>
      )}

      {note && rows === null && !busy && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-mist-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-300" />
          {note}
        </p>
      )}

      {rows !== null && (
        <>
          <p className="mb-2 flex items-start gap-1.5 text-xs text-mist-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-300" />
            {fr
              ? "Lu sur la photo. Les prix sont une estimation — la caisse du restaurant décide."
              : "Read off the photo. Prices are an estimate — the restaurant's till decides."}
          </p>

          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {rows.map((r, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-mist-100">{r.name}</p>
                  <p className="text-xs text-mist-500">
                    {r.priceXaf != null
                      ? `≈ ${r.priceXaf.toLocaleString("fr-FR")} XAF`
                      : fr ? "Prix non lu" : "Price not read"}
                    {r.unit ? ` · ${r.unit}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center rounded-xl border border-ink-700 bg-ink-800">
                  <button
                    type="button"
                    onClick={() => bump(i, -1)}
                    aria-label={fr ? "Moins" : "Fewer"}
                    className="px-2 py-1.5 text-mist-400"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-5 text-center text-sm tabular-nums text-mist-100">{want[i] ?? 0}</span>
                  <button
                    type="button"
                    onClick={() => bump(i, 1)}
                    aria-label={fr ? "Plus" : "More"}
                    className="px-2 py-1.5"
                    style={{ color: accent }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={() => {
              const text = chosen.map((p) => `${p.qty}× ${p.row!.name}`).join(", ");
              onAdd(text, estimate);
              setRows(null);
              setNote(null);
              setWant({});
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-40"
            style={{ backgroundColor: accent }}
          >
            <Plus className="h-4 w-4" />
            {chosen.length === 0
              ? fr ? "Choisissez des plats" : "Pick some dishes"
              : fr
                ? `Ajouter ${chosen.length} plat${chosen.length === 1 ? "" : "s"}`
                : `Add ${chosen.length} dish${chosen.length === 1 ? "" : "es"}`}
          </button>

          {estimate > 0 && (
            <p className="mt-2 text-xs text-mist-500">
              {fr ? "Estimation de la nourriture : " : "Food estimate: "}
              <span className="tabular-nums text-mist-300">≈ {estimate.toLocaleString("fr-FR")} XAF</span>
              {anyUnpriced && (fr ? " (certains prix non lus)" : " (some prices weren't read)")}
              {fr
                ? " — ce n'est pas les frais de livraison."
                : " — this is not the delivery fee."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
