"use client";

import { useState } from "react";
import { FileText, Loader2, Plus, Trash2, ShieldCheck, AlertTriangle } from "lucide-react";

import type { DraftMedicine } from "@/lib/ai/prescriptionPhoto";

/**
 * The prescription they just photographed, read back as rows they can correct.
 *
 * ## Why this is here
 *
 * The upload box above it already takes a photo of the ordonnance and sends it
 * to the pharmacist. What it does not do is save the customer from *also*
 * typing every drug name into the list below — which is what they are doing at
 * 2 AM, from a doctor's handwriting, with a sick child.
 *
 * ## Three things it will not do, and they are the design
 *
 * **It never shows a medicine that was not read.** Every failure — no reader
 * configured, an unreadable photo, a timeout — says so and shows nothing. The
 * version this was adapted from substitutes a named doctor and two specific
 * drugs when the call fails; on a delivery app that is a fabricated
 * prescription attached to a real order.
 *
 * **Nothing reaches the order until they say they have checked it.** This is a
 * machine reading handwriting and it will get some of them wrong. The rows are
 * editable and the button is disabled until the box is ticked — not as a
 * disclaimer, but because reading them is the step that makes this safe.
 *
 * **It offers no clinical opinion.** No dose check, no interaction warning, no
 * substitution advice. The pharmacist does that. This transcribes.
 */
export function PrescriptionReader({
  photoPath,
  fr,
  accent,
  onAdd,
}: {
  /** The uploaded prescription, once it is stored. Null before then. */
  photoPath: string | null;
  fr: boolean;
  accent: string;
  /** Fills the medicine list the customer already has. */
  onAdd: (rows: DraftMedicine[]) => void;
}) {
  const [reading, setReading] = useState(false);
  const [rows, setRows] = useState<DraftMedicine[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  if (!photoPath) return null;

  async function read() {
    setReading(true);
    setNote(null);
    setChecked(false);
    try {
      const res = await fetch("/api/ai/prescription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoPath }),
      });
      const d = await res.json();
      const items: DraftMedicine[] = Array.isArray(d.items) ? d.items : [];
      setRows(items.length > 0 ? items : null);
      setNote(typeof d.note === "string" ? d.note : null);
    } catch {
      /*
        A network failure and a model failure land in the same place on purpose:
        nothing to show, and a sentence pointing at the thing that still works.
        The photo has already been uploaded and still reaches the pharmacist.
      */
      setRows(null);
      setNote(fr ? "La lecture a échoué. Saisissez les noms vous-même." : "Reading failed. Type the names yourself.");
    } finally {
      setReading(false);
    }
  }

  function edit(i: number, field: keyof DraftMedicine, value: string) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
    // Editing a row after ticking means they are still working; the tick has to
    // be earned again rather than carried over a change they just made.
    setChecked(false);
  }

  function drop(i: number) {
    setRows((prev) => (prev ? prev.filter((_, n) => n !== i) : prev));
    setChecked(false);
  }

  return (
    <div className="mt-3 rounded-xl border border-ink-700 bg-ink-800/50 p-3">
      {rows === null && (
        <>
          <button
            type="button"
            onClick={read}
            disabled={reading}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-60"
            style={{ backgroundColor: accent }}
          >
            {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {reading
              ? fr ? "Lecture de l'ordonnance…" : "Reading the prescription…"
              : fr ? "Lire l'ordonnance pour moi" : "Read the prescription for me"}
          </button>
          <p className="mt-2 text-xs text-mist-500">
            {fr
              ? "Nous essayons de lire les noms pour vous. Vous vérifiez avant que quoi que ce soit n'entre dans la commande."
              : "We try to read the names for you. You check them before anything enters the order."}
          </p>
        </>
      )}

      {note && rows === null && !reading && (
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
              ? "Lu automatiquement à partir de l'écriture. Corrigez ce qui est faux — un nom mal lu part chez le pharmacien."
              : "Read automatically from handwriting. Fix anything wrong — a misread name goes to the pharmacist."}
          </p>

          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={i} className="rounded-lg border border-ink-700 bg-ink-900 p-2.5">
                <div className="flex items-start gap-2">
                  <input
                    value={r.name}
                    onChange={(e) => edit(i, "name", e.target.value)}
                    aria-label={fr ? "Nom du médicament" : "Medicine name"}
                    className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm font-medium text-mist-100"
                  />
                  <button
                    type="button"
                    onClick={() => drop(i)}
                    aria-label={fr ? "Retirer" : "Remove"}
                    className="p-1.5 text-mist-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <input
                    value={r.strength ?? ""}
                    onChange={(e) => edit(i, "strength", e.target.value)}
                    placeholder={fr ? "Dosage" : "Strength"}
                    className="rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-xs text-mist-100 placeholder:text-mist-500"
                  />
                  <input
                    value={r.quantity ?? ""}
                    onChange={(e) => edit(i, "quantity", e.target.value)}
                    placeholder={fr ? "Quantité" : "Quantity"}
                    className="rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-xs text-mist-100 placeholder:text-mist-500"
                  />
                </div>
                {r.dosage && (
                  <p className="mt-1.5 text-xs text-mist-500">
                    {fr ? "Posologie lue : " : "Directions read: "}
                    {r.dosage}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {/*
            The gate, and it is a real one rather than a disclaimer: the button
            below stays disabled until this is ticked, and ticking it is reset
            by any edit. Reading the rows is the step that makes this safe.
          */}
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-mist-300">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded"
            />
            <span>
              {fr
                ? "J'ai vérifié chaque nom et chaque dosage ci-dessus."
                : "I have checked every name and dose above."}
            </span>
          </label>

          <button
            type="button"
            disabled={!checked || rows.length === 0}
            onClick={() => {
              onAdd(rows);
              setRows(null);
              setNote(null);
              setChecked(false);
            }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-40"
            style={{ backgroundColor: accent }}
          >
            <Plus className="h-4 w-4" />
            {fr ? "Ajouter à ma liste" : "Add to my list"}
          </button>

          <p className="mt-2 flex items-start gap-1.5 text-xs text-mist-600">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {fr
              ? "La photo part quand même au pharmacien, qui reste seul juge de ce qui est délivré."
              : "The photo still goes to the pharmacist, who alone decides what is dispensed."}
          </p>
        </>
      )}
    </div>
  );
}
