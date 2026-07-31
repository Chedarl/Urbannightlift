import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { normalizeLoose } from "@/lib/locations/normalize";

export const dynamic = "force-dynamic";

/**
 * The addresses that failed customers, and the places we have learned by
 * delivering.
 *
 * `AddressResolutionLog` has been written on every geocode attempt since the
 * address work shipped, and **read by nothing**. It is a record of exactly
 * which addresses this operation cannot find, which is the most valuable list
 * in the product and has been sitting in a table nobody could see.
 *
 * Grouping by normalized text and ordering by how many customers each one has
 * already failed turns that log into a work queue: fix the top row and you fix
 * it for everyone who types it next.
 *
 * `VerifiedPlace` is the other half — places the operation has learned by
 * actually delivering to them. Those already work in search, but only as
 * anonymous coordinates against a string. Promoting a well-confirmed one into
 * the catalogue gives it a real name and aliases, so it starts matching the
 * other ways people write it.
 */

/** Below this many confirmations a learned place is not yet worth promoting. */
const PROMOTE_THRESHOLD = 2;
/** Only look back this far — an address that failed once in March is noise. */
const WINDOW_DAYS = 90;

export async function GET() {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [failures, weak, learned] = await Promise.all([
    // Never resolved at all: the customer typed something and we found nothing.
    prisma.addressResolutionLog.findMany({
      where: { resolved: false, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { rawText: true, createdAt: true },
    }),
    // Resolved, but barely. A 0.5-confidence OSM guess is a pin that may be a
    // street away, which on a night delivery is a failed first attempt.
    prisma.addressResolutionLog.findMany({
      where: { resolved: true, confidence: { lt: 0.6 }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { rawText: true, createdAt: true, source: true, confidence: true, matchedName: true },
    }),
    prisma.verifiedPlace.findMany({
      where: { confirmations: { gte: PROMOTE_THRESHOLD } },
      orderBy: [{ confirmations: "desc" }, { lastConfirmedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        rawText: true,
        latitude: true,
        longitude: true,
        confirmations: true,
        lastConfirmedAt: true,
        customerId: true,
      },
    }),
  ]);

  // Already in the catalogue? Then it is not a gap — the log predates the fix.
  const existingKeys = new Set(
    (await prisma.serviceLocation.findMany({ where: { active: true }, select: { searchKey: true } }))
      .map((l) => l.searchKey)
      .filter(Boolean)
  );

  /** Collapse "Carrefour Nsam" and "carrefour nsam " into one row to work on. */
  function group(rows: { rawText: string; createdAt: Date }[]) {
    const byKey = new Map<string, { text: string; count: number; lastAt: Date }>();
    for (const r of rows) {
      const key = normalizeLoose(r.rawText);
      if (!key || existingKeys.has(key)) continue;
      const hit = byKey.get(key);
      if (hit) {
        hit.count += 1;
        if (r.createdAt > hit.lastAt) hit.lastAt = r.createdAt;
      } else {
        byKey.set(key, { text: r.rawText, count: 1, lastAt: r.createdAt });
      }
    }
    return [...byKey.values()]
      .sort((a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime())
      .slice(0, 60);
  }

  return NextResponse.json({
    // Ordered by how many customers each one has already failed, so the top of
    // the list is always the most expensive thing to leave broken.
    failing: group(failures).map((g) => ({
      text: g.text,
      count: g.count,
      lastAt: g.lastAt.toISOString(),
    })),
    weak: group(weak).map((g) => ({
      text: g.text,
      count: g.count,
      lastAt: g.lastAt.toISOString(),
    })),
    learned: learned.map((p) => ({
      id: p.id,
      text: p.rawText,
      latitude: p.latitude,
      longitude: p.longitude,
      confirmations: p.confirmations,
      lastConfirmedAt: p.lastConfirmedAt.toISOString(),
      // A place tied to one customer is their home; a shared one has been
      // confirmed by strangers and is safe to name publicly.
      personal: p.customerId != null,
    })),
    windowDays: WINDOW_DAYS,
  });
}
