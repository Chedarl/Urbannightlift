"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Check, AlertTriangle } from "lucide-react";

import { Button } from "@/components/shared/Button";
import type { MerchantCategory } from "@prisma/client";

/**
 * Paste in a list of merchants you have already checked.
 *
 * The catalogue's first fill came from a public map and was mostly businesses
 * that had closed. The fix is not a cleverer data source — it is a person who
 * knows the city handing over a list. This takes that list in whatever shape it
 * arrives: a CSV export, a column copied out of a spreadsheet, or names and
 * numbers typed into WhatsApp.
 *
 * Rows land verified, because someone is vouching for them. The preview exists
 * so nobody discovers a misread column after 200 rows are live.
 */

const CATEGORIES: { value: MerchantCategory; label: string }[] = [
  { value: "FOOD", label: "Food / restaurants" },
  { value: "GROCERY", label: "Supermarkets / groceries" },
  { value: "PHARMACY", label: "Pharmacies" },
  { value: "GENERAL_STORE", label: "Shops" },
  { value: "OTHER", label: "Other" },
];

interface Result {
  detectedHeader: boolean;
  columns: string[];
  created: string[];
  updated: string[];
  skipped: { line: string; why: string }[];
}

export function MerchantListImport() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [category, setCategory] = useState<MerchantCategory>("FOOD");
  const [verified, setVerified] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Result | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/merchants/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, category, verified, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      if (dryRun) {
        setPreview(data);
        setResult(null);
      } else {
        setResult(data);
        setPreview(null);
        setText("");
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ClipboardPaste className="h-4 w-4" /> Paste a list
      </Button>
    );
  }

  return (
    <div className="rounded-2xl border border-gold-400/30 bg-ink-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-display text-sm font-semibold text-gold-300">Import a list you have checked</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-mist-400 hover:text-mist-200">
          Close
        </button>
      </div>

      <p className="mb-3 text-xs text-mist-400">
        One business per line. A header row is optional — with no header it reads as{" "}
        <span className="text-mist-200">name, phone, area, link</span>. Commas, tabs and semicolons all work,
        so a column pasted straight out of a spreadsheet is fine.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={`Name, Phone, Area, Link\nChez Maman Grillades, 690123456, Biyem-Assi, instagram.com/chezmaman\nSupermarché Santa Lucia, 677889900, Bastos`}
        className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 font-mono text-xs text-mist-100 placeholder:text-mist-500 focus:border-violet-500 focus:outline-none"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-mist-400">
          If a row has no category, treat it as
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MerchantCategory)}
            className="rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-mist-400">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
          These are confirmed — publish them to customers straight away
        </label>
      </div>

      {!verified && (
        <p className="mt-2 text-[11px] text-mist-500">
          They will sit in the queue as leads until someone verifies them.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => run(true)} disabled={busy || text.trim().length < 3}>
          Preview
        </Button>
        <Button size="sm" onClick={() => run(false)} disabled={busy || text.trim().length < 3}>
          Import
        </Button>
      </div>

      {error && <p className="mt-2 text-xs text-restricted">{error}</p>}

      {preview && (
        <div className="mt-3 rounded-xl border border-ink-700 bg-ink-950/50 p-3 text-xs">
          <p className="text-mist-300">
            {preview.detectedHeader
              ? `Header row detected — reading columns: ${preview.columns.join(", ")}`
              : `No header row — reading as: ${preview.columns.join(", ")}`}
          </p>
          <p className="mt-1 text-mist-400">
            {preview.created.length} rows would be imported
            {preview.skipped.length > 0 && `, ${preview.skipped.length} skipped`}.
          </p>
          {preview.created.length > 0 && (
            <p className="mt-1 text-mist-500">First few: {preview.created.slice(0, 5).join(" · ")}</p>
          )}
          {preview.skipped.length > 0 && (
            <p className="mt-1 flex items-start gap-1 text-gold-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {preview.skipped
                .slice(0, 3)
                .map((s) => `"${s.line.slice(0, 40)}" — ${s.why}`)
                .join("; ")}
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-xl border border-safe/30 bg-safe/5 p-3 text-xs text-safe">
          <p className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" />
            {result.created.length} added, {result.updated.length} already on file and updated
            {result.skipped.length > 0 && `, ${result.skipped.length} skipped`}.
          </p>
        </div>
      )}
    </div>
  );
}
