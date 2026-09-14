"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wand2 } from "lucide-react";

import { Button } from "@/components/shared/Button";
import { MenuPhotoImport } from "@/components/admin/MenuPhotoImport";
import { ImagePicker } from "@/components/shared/ImagePicker";
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
  /** `bucket/key` of the dish photograph, if anyone has taken one. */
  photoUrl?: string | null;
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
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<DraftRow[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Every mutation on this panel reports what came back.
   *
   * `add`, `setOtc` and `remove` all used to discard the response entirely. On
   * any failure the fields cleared, the list did not change, and nothing was
   * said — which is exactly what "adding their menu does not work" looks like
   * from the outside, whether or not the server was refusing.
   *
   * **This is the same defect fixed for the fourth time in this codebase.** So,
   * stated as a rule rather than a patch: a `fetch` in an admin mutation whose
   * response is not read is a review smell. There is one helper, everything
   * goes through it, and a caller cannot forget.
   */
  async function send(
    label: string,
    url: string,
    init: RequestInit
  ): Promise<boolean> {
    try {
      const res = await fetch(url, init);
      if (res.ok) return true;
      const data = await res.json().catch(() => ({}));
      setNote(
        res.status === 403 || res.status === 401
          ? `Your role does not allow that (${label}).`
          : (data.error ?? `${label} didn't go through (${res.status}).`)
      );
      return false;
    } catch {
      setNote(`Couldn't reach the server (${label}).`);
      return false;
    }
  }

  async function add(n: string, p: number | null, extra: Record<string, unknown> = {}) {
    return send("Adding the item", `/api/merchants/${merchantId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n, priceXaf: p, ...extra }),
    });
  }

  async function addOne() {
    if (name.trim().length < 2) return;
    setBusy(true);
    setNote(null);
    const ok = await add(name.trim(), price ? Number(price) : null, {
      category: category.trim() || null,
      description: description.trim() || null,
    });
    // The fields are only cleared once the row actually exists. Clearing them
    // on a failure throws away what somebody just typed and makes a server
    // error look like a screen that ignored them.
    if (ok) {
      setName("");
      setPrice("");
      setCategory("");
      setDescription("");
    }
    setBusy(false);
    if (ok) startTransition(() => router.refresh());
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
    setNote(null);
    const ok = await send(
      otcApproved ? "Putting it on the shelf" : "Taking it off the shelf",
      `/api/merchants/${merchantId}/products`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, otcApproved }),
      }
    );
    if (ok) startTransition(() => router.refresh());
  }

  /** A picture of the dish, which nothing in this product could set until now. */
  async function setPhoto(productId: string, photoUrl: string | null) {
    setNote(null);
    const ok = await send("Saving the photo", `/api/merchants/${merchantId}/products`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, photoUrl }),
    });
    if (ok) startTransition(() => router.refresh());
  }

  async function remove(productId: string) {
    setNote(null);
    const ok = await send(
      "Removing the item",
      `/api/merchants/${merchantId}/products?productId=${productId}`,
      { method: "DELETE" }
    );
    if (ok) startTransition(() => router.refresh());
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
    setNote(null);
    let saved = 0;
    for (const i of picked) {
      const row = draft?.[i];
      if (!row) continue;
      // Stop at the first refusal. Ploughing on would report a whole menu saved
      // when the first row was rejected and the rest may be too.
      if (!(await add(row.name, row.priceXaf))) break;
      saved++;
    }
    if (saved === picked.size) {
      setDraft(null);
      setPicked(new Set());
    } else {
      setNote((n) => `${n ?? "That didn't finish."} ${saved} of ${picked.size} saved.`);
    }
    setBusy(false);
    if (saved > 0) startTransition(() => router.refresh());
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
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
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
              {/* The dish photo. The customer's menu has rendered this column
                  since the card was built and no screen could fill it. */}
              <ImagePicker
                value={p.photoUrl ?? null}
                onChange={(path) => setPhoto(p.id, path)}
                label={`Photo of ${p.name}`}
                prefix={`dish-${p.id}`}
                shape="square"
                disabled={pending}
              />
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
        {/* What the board groups it under. Two or more categories turn the
            customer's menu into a browsable strip instead of a long list —
            the menu photo already reads these, this is the typed door. */}
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Group (Grillades…)"
          className="w-36 rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One short line (optional)"
          className="min-w-[10rem] flex-1 rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none"
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

      {note && <p className="mt-2 text-xs text-mist-400">{note}</p>}

      {draft && draft.length > 0 && (
        <div className="mt-3 rounded-lg border border-gold-400/30 bg-gold-400/5 p-2.5">
          <p className="text-xs text-gold-200">
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
