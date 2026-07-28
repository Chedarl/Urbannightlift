import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";

/**
 * Draft a price list from the merchant's *own* website.
 *
 * Menu prices for Yaoundé are not published anywhere we may copy: no delivery
 * platform covers the city with public menus, and directory listings and their
 * photos belong to whoever runs the directory. A merchant's own site is the one
 * source that is theirs to publish and ours to read — a small number of them do
 * have one, and their prices are real.
 *
 * This only ever returns a *draft*. Nothing is saved until an admin ticks the
 * rows, because a price scraped off a page can be stale, seasonal, or the
 * dine-in rate rather than the takeaway one.
 */

export interface DraftProduct {
  name: string;
  priceXaf: number;
}

/** FCFA prices are written 9,000 / 9.000 / 9 000 / 9000 F / 9000 FCFA. */
const PRICE_RE =
  /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’\-.,() ]{2,60}?)\s*[:\-–—]?\s*(\d{1,3}(?:[ .,]\d{3})+|\d{4,6})\s*(?:F\b|FCFA|XAF|CFA)?/gi;

const MIN_PRICE = 200;
const MAX_PRICE = 200_000;

/**
 * Page furniture that sits next to a four-digit number and reads like a price.
 * "Copyright 2026" is the classic one; a year falls squarely inside the range a
 * real dish costs, so it has to be excluded by what it says, not by its value.
 */
const NOISE = /copyright|tous droits|all rights|©|\btel\b|whatsapp|\bbp\b|code postal|version|©\s*\d/i;

function toXaf(raw: string): number | null {
  const digits = raw.replace(/[ .,]/g, "");
  const n = Number(digits);
  if (!Number.isFinite(n) || n < MIN_PRICE || n > MAX_PRICE) return null;
  return n;
}

/** Strip scripts, styles and tags — we only want readable text. */
function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ");
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { website: true, merchantName: true },
  });
  const site = merchant?.website?.trim();
  if (!site) {
    return NextResponse.json(
      { error: "No website on file for this merchant — type the prices from the phone call instead." },
      { status: 400 }
    );
  }

  const url = site.startsWith("http") ? site : `https://${site}`;
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "UrbanNightLift/1.0 (merchant menu draft)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(String(res.status));
    html = await res.text();
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach their site. Type the prices from the phone call instead.", products: [] },
      { status: 200 }
    );
  }

  const text = textFromHtml(html);
  const seen = new Set<string>();
  const products: DraftProduct[] = [];

  for (const match of text.matchAll(PRICE_RE)) {
    const name = match[1].trim().replace(/\s+/g, " ");
    const priceXaf = toXaf(match[2]);
    if (!priceXaf) continue;
    // A bare number with no plausible label is a phone number, an address or a
    // year — not a dish.
    if (name.length < 3 || /^\d+$/.test(name) || NOISE.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    products.push({ name, priceXaf });
    if (products.length >= 40) break;
  }

  return NextResponse.json({
    products,
    source: url,
    note:
      products.length > 0
        ? "Drafted from the merchant's own published page. Confirm each price before saving."
        : "No prices found on that page — many sites load their menu with JavaScript.",
  });
}
