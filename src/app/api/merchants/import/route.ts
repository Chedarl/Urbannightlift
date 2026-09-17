import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { intakeMerchant } from "@/lib/merchants/intake";
import { recordAudit } from "@/lib/audit";
import type { MerchantCategory } from "@prisma/client";

/**
 * POST /api/merchants/import — paste in a list of merchants you have checked.
 *
 * The catalogue's first attempt was filled from a public map and was mostly
 * wrong. This is the opposite: rows the owner has personally confirmed, pasted
 * in as a spreadsheet or a plain list, and marked verified because a person is
 * standing behind each one. That trust is why this is staff-only and audited.
 *
 * Deliberately forgiving about format. Real lists arrive as CSV exports, copied
 * spreadsheet columns, or lines typed into WhatsApp, and a rigid parser would
 * just mean the list never gets imported.
 */

const CATEGORIES: MerchantCategory[] = ["FOOD", "PHARMACY", "GROCERY", "GENERAL_STORE", "OTHER"];

/** Column names people actually use, in English and French. */
const HEADERS: Record<string, string[]> = {
  merchantName: ["name", "merchant", "business", "vendor", "restaurant", "shop", "nom", "commerce"],
  category: ["category", "type", "categorie", "catégorie"],
  whatsappNumber: ["whatsapp", "phone", "number", "contact", "tel", "telephone", "téléphone", "numero", "numéro"],
  neighbourhood: ["neighbourhood", "neighborhood", "area", "quartier", "zone", "location", "lieu"],
  address: ["address", "adresse"],
  landmark: ["landmark", "repere", "repère", "près de", "near"],
  openingHours: ["hours", "opening", "horaires", "heures"],
  socialUrl: ["social", "facebook", "instagram", "tiktok", "page", "link", "lien", "url"],
  notes: ["notes", "note", "comment", "remarque"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "lon"],
  /*
    Stated night flags, for a list that carries them as their own columns
    rather than inside a sentence. Left out, the `hours` column above is parsed
    instead — which is how the owner's batches arrive, since Google writes the
    hours as "Open · Closes 10:00 PM" and that is what gets pasted.
  */
  nightOpen: ["nightopen", "night open", "night", "nuit"],
  open24h: ["open24h", "24h", "24 h", "24 hours", "24/7"],
};

/** "yes", "true", "1", "oui" — anything else in a stated column is a no. */
function truthy(v: string | undefined): boolean | undefined {
  if (v == null || v.trim() === "") return undefined;
  return /^(y|yes|true|1|oui|o)$/i.test(v.trim());
}

function matchHeader(cell: string): string | null {
  const c = cell.trim().toLowerCase();
  for (const [field, names] of Object.entries(HEADERS)) {
    if (names.some((n) => c === n || c.includes(n))) return field;
  }
  return null;
}

/** Split a line on commas, tabs or semicolons, honouring quoted cells. */
function splitLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (!quoted && (ch === "," || ch === "\t" || ch === ";")) {
      cells.push(current);
      current = "";
    } else current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function guessCategory(raw: string, fallback: MerchantCategory): MerchantCategory {
  const c = raw.trim().toLowerCase();
  if (!c) return fallback;
  const direct = CATEGORIES.find((x) => x.toLowerCase() === c);
  if (direct) return direct;
  if (/pharmac/.test(c)) return "PHARMACY";
  if (/super|march[ée]|grocer|alimentation|boutique|epicerie|épicerie/.test(c)) return "GROCERY";
  if (/restaur|food|snack|grill|repas|p[âa]tisserie|boulanger|caf[ée]|bar/.test(c)) return "FOOD";
  if (/shop|store|magasin/.test(c)) return "GENERAL_STORE";
  return fallback;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : "";
  const fallbackCategory = CATEGORIES.find((c) => c === body.category) ?? "FOOD";
  // A list the owner has checked is trusted by default; the toggle lets a
  // half-checked list come in as leads instead.
  const markVerified = body.verified !== false;
  const dryRun = body.dryRun === true;

  const lines = text
    .split(/\r?\n/)
    .map((l: string) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return NextResponse.json({ error: "Nothing to import." }, { status: 400 });
  }

  // A header row is optional. If the first line names columns we recognize, use
  // it; otherwise fall back to "name, phone, area" which is how these lists are
  // usually written by hand.
  const firstCells = splitLine(lines[0]);
  const headerMap = firstCells.map(matchHeader);
  const hasHeader = headerMap.filter(Boolean).length >= 2;
  const columns = hasHeader
    ? headerMap
    : ["merchantName", "whatsappNumber", "neighbourhood", "socialUrl"];
  const rows = hasHeader ? lines.slice(1) : lines;

  const created: string[] = [];
  const updated: string[] = [];
  const skipped: { line: string; why: string }[] = [];

  for (const line of rows) {
    const cells = splitLine(line);
    const record: Record<string, string> = {};
    cells.forEach((value, i) => {
      const field = columns[i];
      if (field && value) record[field] = value;
    });

    // A single-column list is just names — still worth importing, since the name
    // plus a phone call is how the rest gets filled in.
    if (!record.merchantName && cells[0]) record.merchantName = cells[0];

    const name = (record.merchantName ?? "").trim();
    if (name.length < 2) {
      skipped.push({ line, why: "no business name" });
      continue;
    }

    const lat = Number(record.latitude);
    const lng = Number(record.longitude);

    if (dryRun) {
      created.push(name);
      continue;
    }

    const result = await intakeMerchant({
      merchantName: name,
      category: guessCategory(record.category ?? "", fallbackCategory),
      whatsappNumber: record.whatsappNumber ?? "",
      address: record.address ?? null,
      neighbourhood: record.neighbourhood ?? null,
      landmark: record.landmark ?? null,
      latitude: Number.isFinite(lat) && record.latitude ? lat : null,
      longitude: Number.isFinite(lng) && record.longitude ? lng : null,
      openingHours: record.openingHours ?? null,
      // Undefined rather than false when the column is absent, so
      // `intakeMerchant` falls through to reading the hours text.
      nightOpen: truthy(record.nightOpen),
      open24h: truthy(record.open24h),
      socialUrl: record.socialUrl ?? null,
      notes: record.notes ?? null,
      verified: markVerified,
      source: "list",
    });
    (result.created ? created : updated).push(result.merchantName);
  }

  if (!dryRun) {
    await recordAudit({
      actor: { id: user.id, fullName: user.fullName, role: user.role },
      action: "merchant.list_imported",
      entityType: "merchant",
      entityId: "bulk",
      entityLabel: `${created.length} added, ${updated.length} updated`,
      reason: typeof body.reason === "string" ? body.reason : null,
    });
  }

  return NextResponse.json({
    dryRun,
    detectedHeader: hasHeader,
    columns: columns.filter(Boolean),
    created,
    updated,
    skipped,
  });
}
