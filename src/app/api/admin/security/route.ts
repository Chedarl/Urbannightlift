import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { secretStatus, secretAdvice } from "@/lib/security/secrets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET — which variable is signing what.
 *
 * **OWNER only**, and it returns variable *names* only — never a value, never a
 * prefix, never a length. The name is enough to answer "am I configured the way
 * I think I am", which is the question that has cost this project a fortnight
 * on three separate occasions, and it is useless to anybody who obtains it.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = secretStatus();
  return NextResponse.json({ rows, advice: secretAdvice(rows) });
}
