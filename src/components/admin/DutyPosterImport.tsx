"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Check, X } from "lucide-react";

import { Button } from "@/components/shared/Button";
import { downscaleImage } from "@/lib/uploads/downscale";

/**
 * Photograph the duty poster instead of typing the week out.
 *
 * The pharmacie de garde roster is the single most useful thing this product
 * can know at 2 AM, and it is not on the internet — `ordrepharmacien.cm` does
 * not resolve, and the one directory that claims to carry the Yaoundé list
 * serves an empty template. It exists as posters on pharmacy doors, PDFs and
 * Facebook posts. So the camera is not a shortcut here; it is the only route.
 *
 * One photograph is worth a fortnight of this screen: a week of duty rows, and
 * a list of real pharmacies with their quartiers that we do not otherwise have.
 *
 * **Rows are ticked one at a time and dates are editable**, because a
 * half-read duty row is worse than a missing one — it looks authoritative and
 * sends somebody across the city to a closed shutter.
 */

interface Shift {
  pharmacyName: string;
  neighbourhood: string | null;
  phone: string | null;
  startsOn: string;
  endsOn: string;
  merchantId: string | null;
  matchedName: string | null;
}

export function DutyPosterImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<"upload" | "read" | "save" | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(original: File) {
    // A 3 MB phone photo becomes a few hundred kilobytes before it leaves the
    // device — the difference between this working on mobile data and not.
    const file = await downscaleImage(original);
    setError(null);
    setNote(null);
    setShifts([]);
    setSaved(new Set());
    setBusy("upload");
    try {
      const signed = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "merchant-captures", fileName: file.name }),
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
      const data = await fetch("/api/admin/duty-poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoPath: signed.path }),
      }).then((r) => r.json());

      setNote(data.note ?? data.error ?? null);
      setShifts(data.shifts ?? []);
    } catch {
      setError("Something went wrong reading that poster.");
    } finally {
      setBusy(null);
    }
  }

  function edit(index: number, patch: Partial<Shift>) {
    setShifts((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  /** Saves one row through the duty endpoint that already exists. */
  async function saveOne(index: number) {
    const s = shifts[index];
    if (!s.merchantId) return;
    setBusy("save");
    setError(null);
    try {
      const res = await fetch("/api/pharmacy-duty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: s.merchantId,
          startsOn: new Date(`${s.startsOn}T00:00:00`).toISOString(),
          // Inclusive of the final night, matching the manual form below —
          // a shift "ending" Sunday means Sunday night, not Sunday morning.
          endsOn: new Date(`${s.endsOn}T23:59:59`).toISOString(),
        }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Couldn't save that row.");
        return;
      }
      setSaved((prev) => new Set(prev).add(index));
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-950/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          {busy === "upload" || busy === "read" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
          {busy === "upload" ? "Uploading…" : busy === "read" ? "Reading…" : "Photograph the duty poster"}
        </Button>
        <span className="text-xs text-mist-500">
          The whole week at once. You check every date before it saves.
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
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

      {shifts.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {shifts.map((s, i) => {
            const done = saved.has(i);
            return (
              <li
                key={i}
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 ${
                  done ? "border-safe/40 bg-safe/5" : "border-ink-700 bg-ink-900"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-mist-100">{s.pharmacyName}</span>
                  <span className="block text-xs text-mist-500">
                    {s.neighbourhood ?? "quartier not read"}
                    {s.phone ? ` · ${s.phone}` : ""}
                    {/*
                      Said out loud rather than left to be noticed. An unmatched
                      row is not a failure — it is a pharmacy we do not have yet,
                      and adding it is the other half of what this photo is for.
                    */}
                    {s.merchantId ? (
                      <span className="text-safe"> · {s.matchedName}</span>
                    ) : (
                      <span className="text-caution"> · not in the catalogue yet</span>
                    )}
                  </span>
                </span>
                <input
                  type="date"
                  value={s.startsOn}
                  onChange={(e) => edit(i, { startsOn: e.target.value })}
                  className="rounded border border-ink-700 bg-ink-800 px-1.5 py-1 text-xs text-mist-200"
                />
                <input
                  type="date"
                  value={s.endsOn}
                  onChange={(e) => edit(i, { endsOn: e.target.value })}
                  className="rounded border border-ink-700 bg-ink-800 px-1.5 py-1 text-xs text-mist-200"
                />
                {done ? (
                  <span className="flex items-center gap-1 text-xs text-safe">
                    <Check className="h-3 w-3" /> on duty
                  </span>
                ) : s.merchantId ? (
                  <Button size="sm" variant="outline" onClick={() => saveOne(i)} disabled={busy !== null}>
                    Set duty
                  </Button>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-mist-600">
                    <X className="h-3 w-3" /> add the pharmacy first
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
