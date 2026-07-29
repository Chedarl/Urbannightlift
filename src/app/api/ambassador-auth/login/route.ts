import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeCode } from "@/lib/ambassadors/rules";
import { ambassadorProgrammeOn } from "@/lib/ambassadors/programme";
import {
  createAmbassadorSession,
  lockState,
  registerFailedAttempt,
  registerSuccessfulLogin,
  verifyPin,
} from "@/lib/auth/ambassador";

/**
 * POST /api/ambassador-auth/login — an ambassador signing in to see what they
 * have earned.
 *
 * Every failure returns the same "invalid" answer whatever went wrong, so this
 * cannot be used to discover which codes exist. The one exception is a locked
 * account, where staying silent would just look broken to the real owner.
 */
export async function POST(req: NextRequest) {
  // Hiding the page is not closing the route.
  if (!(await ambassadorProgrammeOn())) {
    return NextResponse.json({ error: "The ambassador programme is not open at the moment." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const code = normalizeCode(typeof body.code === "string" ? body.code : "");
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";

  if (!code || !pin) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const ambassador = await prisma.ambassador.findUnique({ where: { code } });
  if (!ambassador || !ambassador.pinHash) {
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const lock = lockState(ambassador);
  if (lock.locked) {
    return NextResponse.json({ error: "locked", minutesLeft: lock.minutesLeft }, { status: 429 });
  }

  if (!(await verifyPin(pin, ambassador.pinHash))) {
    const next = await registerFailedAttempt(ambassador);
    return NextResponse.json(
      next.locked ? { error: "locked", minutesLeft: next.minutesLeft } : { error: "invalid" },
      { status: next.locked ? 429 : 401 }
    );
  }

  // A suspended ambassador is told plainly rather than left guessing why their
  // correct PIN "doesn't work".
  if (ambassador.status === "SUSPENDED") {
    return NextResponse.json({ error: "suspended" }, { status: 403 });
  }

  await registerSuccessfulLogin(ambassador.id);
  await createAmbassadorSession(ambassador.id);

  // A pending ambassador can sign in and see the screen — they just have
  // nothing yet, and being told "waiting for approval" beats a dead login.
  return NextResponse.json({ ok: true, status: ambassador.status });
}
