/**
 * What a business is known for, from what it actually sells.
 *
 * ## Why this is its own module
 *
 * It lived in `BusinessCard.tsx`, which is `"use client"`. The hub's shelf is
 * read on the server, so `featuredMerchants` called it across that boundary and
 * Next replaced it with a client reference — every request to `/order` came
 * back **500**.
 *
 * Nothing caught it. `tsc` was happy, lint was happy, `next build` succeeded,
 * and seventy suites passed; the page simply did not load. The boundary is not
 * a type, so only running the thing finds it.
 *
 * So it lives here: a plain module with no directive at either end, imported by
 * the server query and the client card alike. `verify-client-boundary` fails if
 * a `server-only` module reaches into a client one again.
 */

/**
 * Three things a business is known for, from what it actually sells.
 *
 * Categories first, because a category is how the merchant themselves group
 * their board — "Brochettes", "Poulet" — and it stays true as individual dishes
 * come and go. Product names are used **instead**, never as well, for a
 * merchant who never categorised anything, which is most of them early on.
 *
 * Mixing the two produced "Brochettes · Poisson braisé · Coca-Cola" on a
 * merchant with one category and five dishes: two kinds of label in one row,
 * with no way for the reader to tell which is which.
 */
export function tagsFromProducts(
  items: { name: string; category?: string | null }[]
): string[] {
  const hasCategories = items.some((i) => (i.category ?? "").trim());
  const source = hasCategories ? items.map((i) => i.category) : items.map((i) => i.name);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of source) {
    const t = titleCase((raw ?? "").trim());
    // Anything long enough to wrap is a dish description, not a label.
    if (!t || t.length > 18) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Recases a shouted label, and leaves everything else alone.
 *
 * `MerchantProduct.category` holds them as the admin form takes them —
 * `BROCHETTES` — and a row of capitals on a card reads as an error message. A
 * merchant who typed "Poisson braisé" knows their own board better than this
 * function does, so that is left exactly as written.
 */
export function titleCase(s: string): string {
  if (!s) return s;
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(/(\s|-)/)
    .map((w) => (/^[a-zà-ÿ]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join("");
}
