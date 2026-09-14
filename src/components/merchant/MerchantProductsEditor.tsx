"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { PageHeader, CardGroup, RowDivider } from "@/components/shared/portalKit";
import { Button } from "@/components/shared/Button";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { formatXaf } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  priceXaf: number | null;
  unit: string | null;
  available: boolean;
  /** `bucket/key` of the dish photograph, if they have taken one. */
  photoUrl: string | null;
}

/**
 * Add, price, hide and remove items — from the shop's own phone.
 *
 * The "sold out tonight" toggle matters more than it looks. A shop that cannot
 * mark a dish unavailable either takes the order and disappoints someone, or
 * closes the whole shop. This is the middle option, and it is one tap.
 */
export function MerchantProductsEditor({ initial }: { initial: Product[] }) {
  const router = useRouter();
  const { locale } = useTranslation();
  const fr = locale === "fr";

  const [products, setProducts] = useState(initial);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: string, body?: unknown, query = "") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchant-account/products${query}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : fr ? "Réessayez." : "Try again.");
        return false;
      }
      const listed = await fetch("/api/merchant-account/products").then((r) => r.json());
      setProducts(listed.products ?? []);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const ok = await call("POST", { name, priceXaf: price ? Number(price) : null });
    if (ok) {
      setName("");
      setPrice("");
    }
  }

  const input =
    "rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none";

  return (
    <div>
      <PageHeader
        title={fr ? "Vos articles" : "Your items"}
        subtitle={
          fr
            ? "Ce que les clients voient et le prix qu'ils paient."
            : "What customers see, and the price they pay."
        }
        back="/merchant"
      />

      <div className="mb-5 rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <div className="flex flex-col gap-2">
          <input
            className={input}
            placeholder={fr ? "Nom de l'article" : "Item name"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className={`${input} flex-1`}
              inputMode="numeric"
              placeholder={fr ? "Prix en FCFA" : "Price in XAF"}
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
            />
            <Button size="sm" onClick={add} disabled={busy || !name.trim()}>
              <Plus className="h-4 w-4" /> {fr ? "Ajouter" : "Add"}
            </Button>
          </div>
        </div>
        {/* Because a wrong price is worse than a missing one: the customer sets
            their spending cap from what they read here. */}
        <p className="mt-2 text-xs leading-relaxed text-mist-500">
          {fr
            ? "Laissez le prix vide si vous n'êtes pas sûr — nous confirmerons avec vous. Un prix faux est pire qu'un prix absent."
            : "Leave the price blank if you're not sure — we'll confirm with you. A wrong price is worse than no price."}
        </p>
        {error && <p className="mt-2 text-xs text-restricted">{error}</p>}
      </div>

      {products.length === 0 ? (
        <p className="rounded-2xl border border-ink-700 bg-ink-900 p-8 text-center text-sm text-mist-500">
          {fr
            ? "Rien encore. Commencez par vos cinq articles les plus demandés."
            : "Nothing yet. Start with your five most-asked-for items."}
        </p>
      ) : (
        <CardGroup>
          {products.map((p, i) => (
            <div key={p.id}>
              {i > 0 && <RowDivider />}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Their dish, photographed by them. A picture sells a plate at
                    1 AM far better than its name does, and until now nothing in
                    the product could put one there. */}
                <ImagePicker
                  value={p.photoUrl}
                  onChange={async (path) => {
                    await call("PATCH", { id: p.id, photoUrl: path });
                  }}
                  label={fr ? `Photo de ${p.name}` : `Photo of ${p.name}`}
                  prefix={`dish-${p.id}`}
                  shape="square"
                  disabled={busy}
                  fr={fr}
                />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-base font-medium ${p.available ? "text-mist-100" : "text-mist-500 line-through"}`}>
                    {p.name}
                  </p>
                  <p className="text-xs text-mist-500">
                    {p.priceXaf != null
                      ? formatXaf(p.priceXaf)
                      : fr ? "Prix à confirmer" : "Price to confirm"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => call("PATCH", { id: p.id, available: !p.available })}
                  className={
                    p.available
                      ? "shrink-0 rounded-full border border-safe/50 bg-safe/10 px-2.5 py-1 text-xs font-medium text-safe"
                      : "shrink-0 rounded-full border border-ink-700 px-2.5 py-1 text-xs text-mist-500"
                  }
                >
                  {p.available
                    ? fr ? "Disponible" : "Available"
                    : fr ? "Épuisé" : "Sold out"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => call("DELETE", undefined, `?id=${encodeURIComponent(p.id)}`)}
                  className="shrink-0 rounded-lg p-1.5 text-mist-600 hover:text-restricted"
                  aria-label={fr ? "Supprimer" : "Remove"}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </CardGroup>
      )}
    </div>
  );
}
