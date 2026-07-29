import { NextResponse } from "next/server";
import { clearAmbassadorSession } from "@/lib/auth/ambassador";

export async function POST() {
  await clearAmbassadorSession();
  return NextResponse.json({ ok: true });
}
