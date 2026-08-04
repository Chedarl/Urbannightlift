import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { kimiConfigured, kimiModel, kimiKeySource, kimiBaseUrl, unreadKeyVariables } from "@/lib/ai/kimi";
import { redactSecrets } from "@/lib/redact";

export const dynamic = "force-dynamic";

/**
 * What the model has been asked to do this week, and how often it worked.
 *
 * Every AI feature in this product degrades silently by design — it returns
 * null and the caller does what it did before. That is the right behaviour and
 * it is also precisely how a feature stops working with nobody noticing, which
 * has already cost this project days twice (a basemap nobody knew had fallen
 * back, and email nobody knew was being refused).
 *
 * So the failure rate per purpose is the number that matters here, not the
 * total. One failed address lookup is nothing; address lookups failing every
 * time means a feature is off and the fee, the zone and the rider's trip are
 * quietly worse for it.
 */

const WINDOW_DAYS = 7;

export async function GET() {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [byPurpose, totals, latestPerPurpose, recentFailures] = await Promise.all([
    prisma.aiCall.groupBy({
      by: ["purpose", "ok"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { ms: true },
      _sum: { tokens: true },
    }),
    prisma.aiCall.aggregate({
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { tokens: true },
    }),
    // The most recent call per feature. The week's totals cannot answer "is it
    // working *now*", and a purpose that failed six times before a fix and
    // succeeded once after it was still being reported as "failing every time".
    prisma.aiCall.findMany({
      where: { createdAt: { gte: since } },
      distinct: ["purpose"],
      orderBy: { createdAt: "desc" },
      select: { purpose: true, ok: true },
    }),
    prisma.aiCall.findMany({
      where: { ok: false, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { purpose: true, error: true, createdAt: true, buildRef: true },
    }),
  ]);

  const { variable, fingerprint } = kimiKeySource();
  const build = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;

  const latest = new Map(latestPerPurpose.map((r) => [r.purpose, r.ok]));

  // Fold the ok/failed rows of each purpose into one line per feature.
  const purposes = new Map<string, { ok: number; failed: number; ms: number; tokens: number }>();
  for (const row of byPurpose) {
    const hit = purposes.get(row.purpose) ?? { ok: 0, failed: 0, ms: 0, tokens: 0 };
    if (row.ok) {
      hit.ok += row._count._all;
      // Only successful calls have a meaningful duration; a timeout would
      // otherwise drag the average into looking like a slow feature rather
      // than a broken one.
      hit.ms = Math.round(row._avg.ms ?? 0);
    } else {
      hit.failed += row._count._all;
    }
    hit.tokens += row._sum.tokens ?? 0;
    purposes.set(row.purpose, hit);
  }

  return NextResponse.json({
    configured: kimiConfigured(),
    // Which variable the key came from, and four characters of it. The owner
    // said the key is set "in both but with different names" — and a key under
    // a name nothing reads is completely silent: every screen still says a key
    // is configured, because until now nothing ever asked *which*. Four
    // characters is what Stripe and AWS show; enough to recognise a key you are
    // holding, useless to anyone who is not.
    keyVariable: variable,
    keyFingerprint: fingerprint,
    // Named because `Incorrect API key provided` is also what a perfectly valid
    // api.moonshot.cn key gets from api.moonshot.ai. Same sentence, different
    // fix, and no way to tell them apart without seeing the endpoint.
    baseUrl: kimiBaseUrl(),
    // Names only, never values.
    unreadVariables: unreadKeyVariables(),
    build,
    // Spending money on request is held to the same bar as every other
    // privileged action here.
    canTest: user.role === "OWNER",
    model: kimiModel(),
    windowDays: WINDOW_DAYS,
    calls: totals._count._all,
    tokens: totals._sum.tokens ?? 0,
    purposes: [...purposes.entries()]
      .map(([purpose, v]) => ({
        purpose,
        ...v,
        // Whether the *last* attempt worked. This is what the headline reads,
        // because a fixed feature must stop being reported as broken the moment
        // it works — not seven days later when the failures age out.
        latestOk: latest.get(purpose) ?? false,
      }))
      .sort((a, b) => b.ok + b.failed - (a.ok + a.failed)),
    failures: recentFailures.map((f) => ({
      purpose: f.purpose,
      // Redacted on the way out as well as in. Rows written before the fix
      // still hold a key, and a screen must not be the thing that shows it.
      error: f.error ? redactSecrets(f.error) : null,
      at: f.createdAt.toISOString(),
      buildRef: f.buildRef,
      // The single most useful bit on the screen: whether this failure could
      // still be happening, or belongs to a build that is no longer running.
      stale: Boolean(build && f.buildRef && f.buildRef !== build),
    })),
  });
}
