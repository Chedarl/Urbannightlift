import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { codeProblem, normalizeCode } from "@/lib/ambassadors/rules";
import { hashPin, pinProblem } from "@/lib/auth/ambassador";
import { notifyAmbassadorSignup } from "@/lib/notify/triggers";

/**
 * POST /api/ambassador-signup — somebody proposing themselves as an ambassador.
 *
 * They choose their own code and set their own PIN here, but the row lands
 * PENDING and the code buys nothing until an owner approves it. That ordering
 * matters: every approved row is a standing commitment to pay a stranger real
 * money out of our margin, so nobody self-approves.
 *
 * The PIN is an Urban Night Lift login PIN and nothing else. We never ask for a
 * MoMo or Orange Money PIN, and the payout number is just a number — never a
 * secret code.
 */

/** One application per number per day. */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // A field no human sees and no real application fills.
  if (typeof body.companyWebsite === "string" && body.companyWebsite.trim()) {
    return NextResponse.json({ ok: true });
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const code = normalizeCode(typeof body.code === "string" ? body.code : "");
  const whatsappNumber = normalizePhone(typeof body.whatsappNumber === "string" ? body.whatsappNumber : "");
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";

  if (fullName.length < 3) {
    return NextResponse.json({ error: "Please give your full name." }, { status: 400 });
  }
  if (whatsappNumber.length < 11) {
    return NextResponse.json({ error: "A WhatsApp number is needed — it is how you get paid." }, { status: 400 });
  }
  const codeIssue = codeProblem(code);
  if (codeIssue) return NextResponse.json({ error: codeIssue }, { status: 400 });

  const pinIssue = pinProblem(pin);
  if (pinIssue) return NextResponse.json({ error: pinIssue }, { status: 400 });

  if (body.acceptedTerms !== true) {
    return NextResponse.json({ error: "Please accept the ambassador terms." }, { status: 400 });
  }

  const clash = await prisma.ambassador.findFirst({
    where: { OR: [{ code }, { whatsappNumber }] },
    select: { id: true, code: true, status: true, updatedAt: true, whatsappNumber: true },
  });

  if (clash) {
    // Their own pending application — let them correct it rather than telling
    // them their number is taken by themselves.
    if (clash.whatsappNumber === whatsappNumber && clash.status === "PENDING") {
      if (clash.updatedAt.getTime() > Date.now() - COOLDOWN_MS) {
        return NextResponse.json({
          ok: true,
          alreadyReceived: true,
          message: "We already have your application — we'll be in touch.",
        });
      }
      await prisma.ambassador.update({
        where: { id: clash.id },
        data: {
          fullName,
          reach: typeof body.reach === "string" ? body.reach.slice(0, 500) : null,
          payoutMethod: typeof body.payoutMethod === "string" ? body.payoutMethod : null,
          payoutNumber: typeof body.payoutNumber === "string" ? normalizePhone(body.payoutNumber) : null,
          pinHash: await hashPin(pin),
        },
      });
      return NextResponse.json({ ok: true, updated: true });
    }

    return NextResponse.json(
      {
        error:
          clash.code === code
            ? "That code is already taken — pick another one."
            : "That number is already registered as an ambassador. Sign in instead.",
      },
      { status: 409 }
    );
  }

  const ambassador = await prisma.ambassador.create({
    data: {
      code,
      fullName,
      whatsappNumber,
      reach: typeof body.reach === "string" ? body.reach.slice(0, 500) : null,
      payoutMethod: typeof body.payoutMethod === "string" ? body.payoutMethod : null,
      payoutNumber: typeof body.payoutNumber === "string" ? normalizePhone(body.payoutNumber) : null,
      pinHash: await hashPin(pin),
      // Applying is not being approved. The code buys nothing until an owner
      // says so — resolveCode() refuses anything that is not ACTIVE.
      status: "PENDING",
    },
  });

  await notifyAmbassadorSignup(ambassador.code, ambassador.fullName).catch(() => {});

  return NextResponse.json({ ok: true, code: ambassador.code }, { status: 201 });
}
