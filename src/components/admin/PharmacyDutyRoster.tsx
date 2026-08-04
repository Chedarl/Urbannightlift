"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Trash2, Plus } from "lucide-react";

import { Button } from "@/components/shared/Button";
import { DutyPosterImport } from "@/components/admin/DutyPosterImport";

/**
 * This week's pharmacie de garde.
 *
 * Night pharmacy duty in Cameroon rotates weekly and is published by the Ordre
 * des Pharmaciens as posters and PDFs. There is no feed to read, so it is
 * entered by hand — which at least means an entry expires on its own end date
 * rather than quietly sending a rider to a closed shutter three weeks later.
 *
 * A pharmacy that genuinely never closes is marked `open24h` on the merchant
 * itself instead, since that is not a rotation.
 */

export interface DutyRow {
  id: string;
  merchantId: string;
  merchantName: string;
  endsOn: string;
}

export interface PharmacyOption {
  id: string;
  merchantName: string;
  neighbourhood: string | null;
}

/** Default range: tonight through the end of the usual week-long shift. */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 24 * 3_600_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(now), to: iso(week) };
}

export function PharmacyDutyRoster({
  onDuty,
  pharmacies,
}: {
  onDuty: DutyRow[];
  pharmacies: PharmacyOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const range = defaultRange();
  const [merchantId, setMerchantId] = useState("");
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/pharmacy-duty", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantId,
        startsOn: new Date(`${from}T00:00:00`).toISOString(),
        // Inclusive of the final night: a shift that "ends" on Sunday means
        // Sunday night, not Sunday morning.
        endsOn: new Date(`${to}T23:59:59`).toISOString(),
      }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't save that.");
    else setMerchantId("");
    setBusy(false);
    startTransition(() => router.refresh());
  }

  async function remove(id: string) {
    await fetch(`/api/pharmacy-duty?dutyId=${id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl border border-teal-400/30 bg-teal-400/5 px-3 py-2 text-xs text-teal-200">
        Night pharmacy duty rotates weekly. Whoever is listed here is badged
        &ldquo;On duty tonight&rdquo; on the medicine order page and ranked first when a customer
        searches for a pharmacy. Only verified pharmacies can be listed.
      </p>

      {/* The whole roster from one photograph, before the row-at-a-time form.
          Typing this out weekly is why it goes stale. */}
      <DutyPosterImport />

      <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-mist-200">
          <CalendarDays className="h-4 w-4 text-teal-300" /> Add this week&apos;s duty by hand
        </p>
        {pharmacies.length === 0 ? (
          <p className="text-xs text-mist-500">
            No verified pharmacy yet. Verify one in the queue first — an unverified pharmacy can&apos;t
            be sent a rider.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <select
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              className="rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none"
            >
              <option value="">Choose a pharmacy…</option>
              {pharmacies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.merchantName}
                  {p.neighbourhood ? ` — ${p.neighbourhood}` : ""}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none"
            />
            <Button size="sm" onClick={add} disabled={busy || pending || !merchantId}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-restricted">{error}</p>}
      </div>

      <div className="flex flex-col gap-2">
        {onDuty.length === 0 && (
          <p className="rounded-2xl border border-ink-700 bg-ink-900 p-6 text-center text-sm text-mist-500">
            Nobody is on duty. Customers will still be able to order medicine — dispatch just picks the
            pharmacy on the night.
          </p>
        )}
        {onDuty.map((d) => {
          const until = new Date(d.endsOn);
          const current = until.getTime() >= Date.now();
          return (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink-700 bg-ink-900 p-4"
            >
              <div>
                <p className="font-display font-semibold">{d.merchantName}</p>
                <p className="text-xs text-mist-500">
                  {current ? "On duty until " : "Ended "}
                  {until.toLocaleDateString()}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => remove(d.id)} disabled={pending}>
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
