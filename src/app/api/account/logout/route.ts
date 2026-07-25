import { NextResponse } from "next/server";
import { clearCustomerSession } from "@/lib/auth/customer";

/** POST /api/account/logout — clears the customer session cookie. */
export async function POST() {
  await clearCustomerSession();
  return NextResponse.json({ ok: true });
}
