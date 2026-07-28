/**
 * A merchant's social page, stored as a link to tap.
 *
 * Deliberately not fetched. Facebook killed its Place Search API in 2020 and
 * blocks unauthenticated reads after about one request; Instagram has no
 * name-search endpoint and needs app review for anything more; TikTok has no
 * business listing API at all. And none of them expose a last-post date to an
 * anonymous caller, which is the one thing that would actually tell us whether a
 * business is still trading.
 *
 * So the link is here for a person to look at. Someone browsing Instagram sees
 * the shop posted yesterday, pastes the URL, and that judgement — not a scrape —
 * is what puts the merchant in the catalogue.
 */

export type SocialPlatform = "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "OTHER";

const HOSTS: [RegExp, SocialPlatform][] = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/i, "FACEBOOK"],
  [/(^|\.)instagram\.com$|(^|\.)instagr\.am$/i, "INSTAGRAM"],
  [/(^|\.)tiktok\.com$/i, "TIKTOK"],
];

/** Which platform a pasted URL belongs to, or null if it isn't a URL at all. */
export function detectPlatform(raw: string): { url: string; platform: SocialPlatform } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // People paste "instagram.com/x" as often as the full address.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (!parsed.hostname.includes(".")) return null;

  for (const [pattern, platform] of HOSTS) {
    if (pattern.test(parsed.hostname)) {
      // Drop tracking parameters so the same page doesn't look like two links.
      parsed.search = "";
      parsed.hash = "";
      return { url: parsed.toString(), platform };
    }
  }
  return { url: parsed.toString(), platform: "OTHER" };
}

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  OTHER: "Website",
};

/**
 * How long a confirmation stays trustworthy. Businesses in this market open,
 * move and close quickly — which is exactly how the imported catalogue went bad
 * — so anything nobody has touched in two months is flagged for a re-check
 * rather than quietly assumed to be fine.
 */
export const STALE_AFTER_DAYS = 60;

/** Days since a merchant was last confirmed, or null if never. */
export function daysSince(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const then = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((Date.now() - then.getTime()) / 86_400_000);
}
