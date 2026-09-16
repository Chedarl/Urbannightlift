import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scoreMatch } from "@/lib/locations/normalize";
import { isPlusCode, decodePlusCode } from "@/lib/locations/plusCode";
import { placeAutocomplete, hasGooglePlaces } from "@/lib/maps/google";
import { checkRateLimit } from "@/lib/security/rateLimit";

export interface LocationResult {
  id: string;
  primaryName: string;
  neighbourhood: string;
  arrondissement: string;
  landmark: string | null;
  /**
   * Null only on a Google suggestion, which carries no coordinates until
   * somebody picks it — that is what makes the typing free. The client resolves
   * it through `/api/locations/place` on selection.
   */
  latitude: number | null;
  longitude: number | null;
  plusCode: string | null;
  serviceStatus: string;
  source: "local" | "osm" | "google" | "pluscode";
  /** Set on Google suggestions only. */
  placeId?: string | null;
}

const PRIORITY_STATUSES = new Set(["PRIORITY"]);

/**
 * GET /api/locations/search?q=…
 * Combined ranked results: local Urban Night Lift catalogue first (fuzzy,
 * accent/hyphen-insensitive, Biyem-Assi/Yaoundé VI prioritized), a Plus Code if
 * the query is one, then OpenStreetMap (Nominatim) as a secondary source.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const fr = req.nextUrl.searchParams.get("lang") === "fr";
  // One token per typing session, minted by the client. Google bills the whole
  // session as the single Place Details call that closes it, so every keystroke
  // inside one token is free.
  const sessionToken = req.nextUrl.searchParams.get("session") ?? "";

  /*
   * Both outside sources in this route are somebody else's — Google's billed
   * SKU and OpenStreetMap's free one — and until now anyone could call them
   * here, unauthenticated and without limit. Every other public form in this
   * app has been capped since v33; these two were simply missed.
   *
   * Over the limit the route does **not** refuse. It keeps answering from our
   * own catalogue and stops spending outside, because an address field that
   * returns an error is a broken order, whereas one that returns only the
   * places we already know is a thinner list. The customer behind a carrier NAT
   * who inherits somebody else's usage still gets a working form.
   */
  const within = (await checkRateLimit(req, "placesSearch")).ok;

  const results: LocationResult[] = [];

  // 1) Plus Code
  if (isPlusCode(q)) {
    const p = decodePlusCode(q);
    if (p) {
      results.push({
        id: `plus:${q}`,
        primaryName: q.toUpperCase(),
        neighbourhood: "Plus Code",
        arrondissement: "YAOUNDE_PERIPHERY",
        landmark: null,
        latitude: p.lat,
        longitude: p.lng,
        plusCode: q.toUpperCase(),
        serviceStatus: "REVIEW_REQUIRED",
        source: "pluscode",
      });
    }
  }

  // 2) Local catalogue (fuzzy + ranked)
  const locs = await prisma.serviceLocation.findMany({ where: { active: true } });
  const scored = locs
    .map((l) => {
      let score = scoreMatch(q, l.primaryName, l.aliases);
      if (score > 0) {
        if (PRIORITY_STATUSES.has(l.serviceStatus)) score += 8; // Biyem-Assi priority boost
        if (l.arrondissement === "YAOUNDE_VI") score += 4;
        score += Math.min(l.popularityRank, 100) * 0.05;
      }
      return { l, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  for (const { l } of scored) {
    results.push({
      id: l.id,
      primaryName: l.primaryName,
      neighbourhood: l.neighbourhood,
      arrondissement: l.arrondissement,
      landmark: l.landmark,
      latitude: l.latitude,
      longitude: l.longitude,
      plusCode: l.plusCode,
      serviceStatus: l.serviceStatus,
      source: "local",
    });
  }

  // 3) Google, when the catalogue is thin.
  //
  // Deliberately below the local results and never above them: a place we have
  // seeded or actually delivered to beats anything a third party knows about
  // this city, and the ranking has to say so. Google is here for the streets and
  // businesses OpenStreetMap has never heard of, which in Yaoundé is most of
  // them.
  const googleUsed = within && scored.length < 5 && hasGooglePlaces() && sessionToken.length > 0;
  if (googleUsed) {
    const predictions = await placeAutocomplete(q, sessionToken, fr);
    for (const p of predictions.slice(0, 5)) {
      results.push({
        id: `google:${p.placeId}`,
        primaryName: p.primary,
        neighbourhood: p.secondary || "Yaoundé",
        arrondissement: "YAOUNDE_PERIPHERY",
        landmark: null,
        // No coordinates yet — see the note on LocationResult.
        latitude: null,
        longitude: null,
        plusCode: null,
        serviceStatus: "REVIEW_REQUIRED",
        source: "google",
        placeId: p.placeId,
      });
    }
  }

  // 4) OpenStreetMap, which now only runs when Google is unavailable — no key,
  //    no session, or a failed call. Keeping it means turning the Google key off
  //    degrades search rather than breaking it.
  if (within && scored.length < 5 && results.filter((r) => r.source === "google").length === 0) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      const url =
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q + " Yaoundé")}` +
        `&countrycodes=cm&viewbox=11.35,4.00,11.65,3.75&bounded=1&limit=5&accept-language=fr`;
      const res = await fetch(url, {
        headers: { "User-Agent": "UrbanNightLift/1.0 (locations)", Accept: "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as { display_name: string; lat: string; lon: string; place_id: number }[];
        const seen = new Set(
          results
            .filter((r) => r.latitude != null && r.longitude != null)
            .map((r) => `${r.latitude!.toFixed(3)},${r.longitude!.toFixed(3)}`)
        );
        for (const d of data) {
          const lat = Number(d.lat);
          const lng = Number(d.lon);
          const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const name = d.display_name.split(",").slice(0, 2).join(",").trim();
          results.push({
            id: `osm:${d.place_id}`,
            primaryName: name,
            neighbourhood: d.display_name.split(",")[1]?.trim() ?? "Yaoundé",
            arrondissement: "YAOUNDE_PERIPHERY",
            landmark: null,
            latitude: lat,
            longitude: lng,
            plusCode: null,
            serviceStatus: "REVIEW_REQUIRED",
            source: "osm",
          });
        }
      }
    } catch {
      // OSM optional — local catalogue is the primary source
    }
  }

  return NextResponse.json({ results });
}
