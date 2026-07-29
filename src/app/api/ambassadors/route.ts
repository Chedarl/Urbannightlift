import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/utils";
import { codeProblem, normalizeCode } from "@/lib/ambassadors/rules";

/**
 * Ambassadors — the people who bring us customers and take a cut.
 *
 * Staff-only, because every row here is a standing commitment to pay somebody
 * real money. Approving one is a business decision, so it is audited like the
 * rest of them.
 */

/** GET — staff: the roster, with what each one is owed. */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ambassadors = await prisma.ambassador.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { customers: true, orders: true } },
      ledger: { select: { amountXaf: true } },
    },
  });

  return NextResponse.json({
    ambassadors: ambassadors.map((a) => {
      const earned = a.ledger.filter((l) => l.amountXaf > 0).reduce((s, l) => s + l.amountXaf, 0);
      const paid = a.ledger.filter((l) => l.amountXaf < 0).reduce((s, l) => s - l.amountXaf, 0);
      return {
        id: a.id,
        code: a.code,
        fullName: a.fullName,
        whatsappNumber: a.whatsappNumber,
        payoutMethod: a.payoutMethod,
        payoutNumber: a.payoutNumber,
        status: a.status,
        notes: a.notes,
        createdAt: a.createdAt.toISOString(),
        customerCount: a._count.customers,
        orderCount: a._count.orders,
        earnedXaf: earned,
        paidXaf: paid,
        balanceXaf: earned - paid,
      };
    }),
  });
}

/** POST — staff: add an ambassador. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const code = normalizeCode(typeof body.code === "string" ? body.code : "");
  const whatsappNumber = normalizePhone(typeof body.whatsappNumber === "string" ? body.whatsappNumber : "");

  if (fullName.length < 2) return NextResponse.json({ error: "A name is required" }, { status: 400 });
  if (whatsappNumber.length < 11) {
    return NextResponse.json({ error: "A WhatsApp number is required — it is how they get paid" }, { status: 400 });
  }
  const problem = codeProblem(code);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const clash = await prisma.ambassador.findFirst({
    where: { OR: [{ code }, { whatsappNumber }] },
    select: { code: true, whatsappNumber: true },
  });
  if (clash) {
    return NextResponse.json(
      { error: clash.code === code ? "That code is already taken" : "That number is already an ambassador" },
      { status: 409 }
    );
  }

  const ambassador = await prisma.ambassador.create({
    data: {
      code,
      fullName,
      whatsappNumber,
      payoutMethod: typeof body.payoutMethod === "string" ? body.payoutMethod : null,
      payoutNumber: typeof body.payoutNumber === "string" ? normalizePhone(body.payoutNumber) : null,
      notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : null,
      // Staff adding someone by hand are vouching for them already.
      status: "ACTIVE",
      approvedAt: new Date(),
      approvedById: user.id,
    },
  });

  await recordAudit({
    actor: { id: user.id, fullName: user.fullName, role: user.role },
    action: "ambassador.created",
    entityType: "user",
    entityId: ambassador.id,
    entityLabel: `${ambassador.code} — ${ambassador.fullName}`,
  });

  return NextResponse.json({ ambassador }, { status: 201 });
}
