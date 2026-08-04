"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wand2 } from "lucide-react";

import { Button } from "@/components/shared/Button";
import { MenuPhotoImport } from "@/components/admin/MenuPhotoImport";
import { formatXaf } from "@/lib/utils";

/**
 * The prices we can quote for a merchant.
 *
 * Kept deliberately small. Five prices someone confirmed on the phone are worth
 * more than a full menu nobody keeps current, because a wrong price becomes an
 * argument at the door.
 */

export interface ProductRow {
  id: string;
  name: string;
  priceXaf: number | null;
  /** Pharmacies only: cleared for a customer to see and tap. Default false. */
  otcApproved?: boolean;
}

interface DraftRow {
  name: string;
  priceXaf: number;
}

export function MerchantProducts({
  merchantId,
  merchantName,
  hasWebsite,
  isPharmacy,
  products,
}: {
  merchantId: string;
  merchantName: string;
  hasWebsite: boolean;
  /** Changes what may be published: a pharmacy's list is cleared item by item. */
  isPharmacy?: boolean;
  products: ProductRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [draft, setDraft] = useState<DraftRow[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(n: string, p: number | null) {
    await fetch(`/api/merchants/${merchantId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n, priceXaf: p }),
    });
  }

  async function addOne() {
    if (name.trim().length < 2) return;
    setBusy(true);
    await add(name.trim(), price ? Number(price) : null);
    setName("");
    setPrice("");
    setBusy(false);
    startTransition(() => router.refresh());
  }

  /**
   * Put a pharmacy item on the customer-facing shelf, or take it off.
   *
   * Deliberately one item at a time and never in bulk. A photographed pharmacy
   * price list contains prescription medicines next to the paracetamol, and
   * dispensing those is controlled by the Ordre des Pharmaciens — so the
   * question "may a customer see this and tap it" is answered per row, by a
   * person, and the answer is no until they say otherwise.
   */
  async function setOtc(productId: string, otcApproved: boolean) {
    await fetch(`/api/merchants/${merchantId}/products`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, otcApproved }),
    });
    startTransition(() => router.refresh());
  }

  async function remove(productId: string) {
    await fetch(`/api/merchants/${merchantId}/products?productId=${productId}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  /**
   * Read the merchant's own published page. Nothing is saved by this — the rows
   * come back as a draft to tick, because a price on a web page can be stale,
   * seasonal, or the dine-in rate.
   */
  async function fetchDraft() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/merchants/${merchantId}/menu-draft`, { method: "POST" });
      const d = await res.json();
      setDraft(d.products ?? []);
      setPicked(new Set());
      setNote(d.note ?? d.error ?? null);
    } catch {
      setNote("Couldn't reach their site.");
    }
    setBusy(false);
  }

  async function saveDraft() {
    setBusy(true);
    for (const i of picked) {
      const row = draft?.[i];
      if (row) await add(row.name, row.priceXaf);
    }
    setDraft(null);
    setPicked(new Set());
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-3 rounded-xl border border-ink-700 bg-ink-950/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-mist-300">
          What {merchantName} sells{products.length > 0 ? ` (${products.length})` : ""}
        </p>
        {hasWebsite && (
          <Button size="sm" variant="outline" onClick={fetchDraft} disabled={busy || pending}>
            <Wand2 className="h-3.5 w-3.5" /> Read their website
          </Button>
        )}
      </div>

      {products.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {products.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-xs text-mist-200"
            >
              <span>{p.name}</span>
              <span className="font-semibold text-gold-300">
                {p.priceXaf != null ? formatXaf(p.priceXaf) : "price on the night"}
              </span>
              {isPharmacy && (
                <button
                  type="button"
                  onClick={() => setOtc(p.id, !p.otcApproved)}
                  disabled={pending}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    p.otcApproved
                      ? "bg-safe/15 text-safe"
                      : "border border-ink-600 text-mist-500"
                  }`}
                  title={
                    p.otcApproved
                      ? "Customers can see and tap this. Press to take it off the shelf."
                      : "Hidden from customers. Press only if this is genuinely over-the-counter."
                  }
                >
                  {p.otcApproved ? "On the shelf" : "Not shown"}
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="text-mist-500 hover:text-restricted"
                aria-label={`Remove ${p.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dish or item"
          className="min-w-[10rem] flex-1 rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none"
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="numeric"
          placeholder="Price XAF"
          className="w-28 rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none"
        />
        <Button size="sm" variant="outline" onClick={addOne} disabled={busy || pending || name.trim().length < 2}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {/*
        Typing is the fallback, not the plan. Almost no merchant here has a
        website to read, so the photograph is the route that actually fills a
        catalogue — you are standing in front of their board with the owner.
      */}
      <div className="mt-2">
        <MenuPhotoImport
          merchantId={merchantId}
          merchantName={merchantName}
          onSaved={() => startTransition(() => router.refresh())}
        />
      </div>

      {note && <p className="mt-2 text-[11px] text-mist-400">{note}</p>}

      {draft && draft.length > 0 && (
        <div className="mt-3 rounded-lg border border-gold-400/30 bg-gold-400/5 p-2.5">
          <p className="text-[11px] text-gold-200">
            Drafted from their own page. Tick what is right — nothing is saved until you do.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {draft.map((d, i) => (
              <li key={`${d.name}-${i}`}>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-mist-200">
                  <input
                    type="checkbox"
                    checked={picked.has(i)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      setPicked(next);
                    }}
                  />
                  <span className="flex-1">{d.name}</span>
                  <span className="font-semibold text-gold-300">{formatXaf(d.priceXaf)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={saveDraft} disabled={busy || picked.size === 0}>
              Save {picked.size || ""}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
