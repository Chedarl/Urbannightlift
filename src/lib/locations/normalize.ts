/**
 * Location text normalization + fuzzy scoring for the Yaoundé location search.
 * Handles missing accents, hyphens, spacing, and common abbreviations so that
 * "Biyemassi", "Biyem Assi" and "Biyem-Assi" all resolve to the same place.
 */

/** Lowercase, strip accents, collapse separators — for fuzzy comparison. */
export function normalizeLoose(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/['`’.]/g, "")
    .replace(/[^a-z0-9]+/g, ""); // drop hyphens/spaces/punct entirely
}

/** Token form (keeps word boundaries) for startsWith/word matching. */
export function normalizeTokens(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['`’.]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Build the stored search key from a name + its aliases. */
export function buildSearchKey(primaryName: string, aliases: string[] = []): string {
  return [primaryName, ...aliases].map(normalizeLoose).filter(Boolean).join(" ");
}

/**
 * Score a candidate location against a query. Higher is better; 0 = no match.
 * Exact > alias-exact > startsWith > word-start > contains.
 */
export function scoreMatch(query: string, primaryName: string, aliases: string[]): number {
  const q = normalizeLoose(query);
  if (!q) return 0;
  const name = normalizeLoose(primaryName);
  const aliasNorms = aliases.map(normalizeLoose);

  if (name === q) return 100;
  if (aliasNorms.includes(q)) return 90;
  if (name.startsWith(q)) return 80 - Math.min(name.length - q.length, 20) * 0.5;
  if (aliasNorms.some((a) => a.startsWith(q))) return 70;

  // word-start match on the token form (e.g. "express" → "rond point express")
  const qTokens = normalizeTokens(query).split(" ").filter(Boolean);
  const nameTokens = normalizeTokens(primaryName).split(" ");
  if (qTokens.length && qTokens.every((qt) => nameTokens.some((nt) => nt.startsWith(qt)))) return 60;

  if (name.includes(q)) return 40;
  if (aliasNorms.some((a) => a.includes(q))) return 30;
  return 0;
}
