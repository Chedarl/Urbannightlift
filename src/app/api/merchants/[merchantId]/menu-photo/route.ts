import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { readMenuPhoto, type DraftItem } from "@/lib/ai/menuPhoto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Photograph a menu board, get rows to tick.
 *
 * The food page shows only businesses a human has confirmed, which is right and
 * which means it is empty until somebody fills it. Typing forty dishes and
 * prices per restaurant is the reason it would stay that way.
 *
 * Two steps, deliberately separate:
 *
 *  - **POST** with a photo path reads it and returns a **draft**. Nothing is
 *    written. A price published from an unreviewed photograph is how the
 *    catalogue starts lying again, which this project has already paid for
 *    twice.
 *  - **PUT** with the rows an admin ticked saves them, and only those.
 *
 * The same shape the website menu-draft already uses, for the same reason.
 */

export async function POST(req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const photoPath = typeof body.photoPath === "string" ? body.photoPath : "";
  if (!photoPath) return NextResponse.json({ error: "No photo was given." }, { status: 400 });

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { merchantName: true },
  });
  if (!merchant) return NextResponse.json({ error: "No such merchant." }, { status: 404 });

  const { data: items, error } = await readMenuPhoto(photoPath, merchantId);

  if (!items) {
    // The reason, not an apology. A generic "couldn't read that photo" has twice
    // hidden a real cause — a URL the provider does not accept, then an image
    // that was not an image — while somebody retook a picture that was fine.
    return NextResponse.json({ items: [], note: error ?? "Nothing came back." });
  }

  return NextResponse.json({
    items,
    note:
      items.length > 0
        ? `${items.length} item${items.length === 1 ? "" : "s"} read from the photo. Check each price before saving — customers will see these.`
        : "Nothing sellable was found in that photo.",
  });
}

/** Saves the rows an admin actually ticked. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const rows: DraftItem[] = Array.isArray(body.items) ? body.items : [];
  if (rows.length === 0) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const clean = rows
    .filter((r) => typeof r?.name === "string" && r.name.trim().length >= 2)
    .slice(0, 60)
    .map((r) => ({
      merchantId,
      name: r.name.trim().slice(0, 80),
      nameFr: r.nameFr?.trim()?.slice(0, 80) || null,
      priceXaf:
        typeof r.priceXaf === "number" && Number.isFinite(r.priceXaf) && r.priceXaf > 0
          ? Math.round(r.priceXaf)
          : null,
      unit: r.unit?.trim()?.slice(0, 24) || null,
      category: r.category?.trim()?.slice(0, 32) || null,
      description: r.description?.trim()?.slice(0, 120) || null,
      // Recorded so a price's provenance is never a guess later — this one came
      // from a photograph of their board, reviewed by a named person.
      source: "menu-photo",
    }));

  if (clean.length === 0) return NextResponse.json({ error: "Nothing usable to save." }, { status: 400 });

  const created = await prisma.merchantProduct.createMany({ data: clean, skipDuplicates: true });

  await recordAudit({
    actor: { id: user.id, fullName: user.fullName, role: user.role },
    action: "merchant.menu_photo_saved",
    entityType: "merchant",
    entityId: merchantId,
    reason: `${created.count} item(s) published from a photographed menu`,
  });

  return NextResponse.json({ saved: created.count });
}
