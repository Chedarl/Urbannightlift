import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/customer";

/** GET /api/account/me — the signed-in customer, for prefilling order forms. */
export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ customer: null }, { status: 200 });
  return NextResponse.json({
    customer: {
      fullName: customer.fullName,
      whatsappNumber: customer.whatsappNumber,
      preferredLanguage: customer.preferredLanguage,
    },
  });
}
