import { NextResponse } from "next/server";
import { getCustomerId } from "@/lib/auth/customer";
import { welcomeForCustomer } from "@/lib/welcome/deliver";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/welcome — the signed-in customer's own welcome card.
 *
 * Their session is the authorization, so no token is needed or accepted here:
 * a customer asking for their own card should never have to hold a link to it.
 * The signed link is still returned, because it is what they share.
 *
 * The message body is not returned. That text is written for us to send to
 * them, and reading your own welcome message back is a strange thing to be
 * shown.
 */
export async function GET() {
  const customerId = await getCustomerId();
  if (!customerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const welcome = await welcomeForCustomer(customerId);
  if (!welcome) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    url: welcome.url,
    card: { ...welcome.card, joinedAt: welcome.card.joinedAt.toISOString() },
  });
}
