import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { loadWelcome, sendWelcome, stamp } from "@/lib/welcome/deliver";
import { whatsappProvider } from "@/lib/notify/whatsapp";

export const dynamic = "force-dynamic";

/**
 * Everyone who joined and has never heard from us.
 *
 * A welcome that depends on somebody remembering to send it does not get sent.
 * This is the list, oldest first — because the person who joined four nights ago
 * and heard nothing is the one the silence has cost most — and one tap each.
 *
 * `welcomeSentAt` is null for every account that existed before this shipped,
 * which is correct: they genuinely were never welcomed, and backfilling the
 * column would have hidden exactly the list somebody needs to work through.
 */

const LIMIT = 40;

export async function GET() {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [customers, merchants] = await Promise.all([
    prisma.customer.findMany({
      // A guest who never claimed an account has not joined anything, so there
      // is nothing to welcome them to.
      where: { welcomeSentAt: null, pinHash: { not: null } },
      orderBy: { createdAt: "asc" },
      take: LIMIT,
      select: { id: true, fullName: true, whatsappNumber: true, createdAt: true },
    }),
    prisma.merchant.findMany({
      where: { welcomeSentAt: null, source: "signup" },
      orderBy: { createdAt: "asc" },
      take: LIMIT,
      select: {
        id: true,
        merchantName: true,
        whatsappNumber: true,
        phone: true,
        createdAt: true,
        verified: true,
      },
    }),
  ]);

  return NextResponse.json({
    provider: whatsappProvider(),
    customers: customers.map((c) => ({
      id: c.id,
      name: c.fullName,
      phone: c.whatsappNumber,
      joinedAt: c.createdAt.toISOString(),
    })),
    merchants: merchants.map((m) => ({
      id: m.id,
      name: m.merchantName,
      phone: m.whatsappNumber ?? m.phone,
      joinedAt: m.createdAt.toISOString(),
      verified: m.verified,
    })),
  });
}

/**
 * POST — send it, or hand back the link to send it with.
 *
 * On the Cloud API the message goes by itself and `welcomeSentAt` is stamped by
 * the sender. On click-to-chat there is nothing to send automatically, so this
 * returns the `wa.me` link and stamps it here: the operator is about to tap it,
 * and a queue that never empties is a queue nobody works. They can still send
 * again from the customer's own record.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "merchant" ? "merchant" : "customer";
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const welcome = await loadWelcome(kind, id);
  if (!welcome) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!welcome.to) {
    return NextResponse.json({ error: "This account has no WhatsApp number." }, { status: 400 });
  }

  const result = await sendWelcome(kind, id);
  if (result.link) await stamp(kind, id);

  return NextResponse.json({ ...result, url: welcome.url, to: welcome.to });
}
