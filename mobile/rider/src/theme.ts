/**
 * The same palette the website uses, so the two do not look like two products.
 * Values mirror the `@theme` tokens in `src/app/globals.css`.
 */
export const c = {
  ink950: "#0a0710",
  ink900: "#12101a",
  ink800: "#1c1928",
  ink700: "#2a2640",
  mist100: "#e8e6ef",
  mist300: "#b5b1c4",
  mist400: "#9a95ad",
  mist500: "#8e8aa0",
  gold: "#d4af37",
  violet: "#7b2cbf",
  violet300: "#b98cf0",
  safe: "#2fae60",
  caution: "#e0a32f",
  restricted: "#e0522f",
} as const;

export const formatXaf = (n: number): string =>
  `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
