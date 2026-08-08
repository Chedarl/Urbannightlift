import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { draftReply, type CaseFacts } from "@/lib/ai/replyDraft";
import { customerStatusDictKey } from "@/lib/orders/statusLabels";
import { serviceLabels } from "@/lib/ai/assistant/labels";
import { translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST — a first draft of a reply for this case.
 *
 * **It writes nothing and sends nothing.** The draft goes back to the browser,
 * lands in the reply box exactly as a canned reply does, and the same Send
 * button a person has always pressed is what reaches the customer.
 *
 * The context is assembled here rather than passed in, so a caller cannot
 * widen it. In particular the delivery OTP is **never selected** — the same
 * absolute rule the customer assistant follows, enforced the same way: not by
 * filtering it out afterwards, but by never loading it.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const found = await prisma.supportRequest.findUnique({
    where: { id: caseId },
    select: {
      category: true,
      message: true,
      fullName: true,
      messages: { orderBy: { createdAt: "asc" }, select: { body: true, authorType: true, internal: true } },
      customer: {
        select: {
          fullName: true,
          preferredLanguage: true,
          orders: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              orderCode: true,
              serviceType: true,
              orderStatus: true,
              createdAt: true,
              // Note what is absent: otpCode. It is not filtered later — it
              // never leaves the database on this path.
            },
          },
        },
      },
    },
  });
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });

  /*
   * The language is the customer's own stored preference, read here rather than
   * sent by the browser. A dispatcher's screen being in English says nothing
   * about which language the customer wrote in, and drafting a French speaker
   * an English reply is exactly the leak `verify-i18n` exists to catch.
   */
  const fr = found.customer?.preferredLanguage === "FR";
  const labels = serviceLabels(fr);

  const facts: CaseFacts = {
    fr,
    customerName: found.customer?.fullName ?? found.fullName,
    category: found.category,
    // The first message is the form submission itself; the rest is the thread.
    // Internal notes are excluded: they are staff talking to each other, and a
    // draft that quotes one back at the customer would be a real leak.
    messages: [
      { from: "customer" as const, text: found.message },
      ...found.messages
        .filter((m) => !m.internal)
        .map((m) => ({
          from: m.authorType === "STAFF" ? ("staff" as const) : ("customer" as const),
          text: m.body,
        })),
    ].slice(-12),
    orders: (found.customer?.orders ?? []).map((o) => ({
      orderCode: o.orderCode,
      service: labels[o.serviceType] ?? o.serviceType,
      // The same words the customer has already been shown, in the language the
      // reply is being written in — never a raw enum for a model to paraphrase.
      status: translate(fr ? "fr" : "en", customerStatusDictKey(o.orderStatus)),
      placedAt: o.createdAt.toISOString().slice(0, 10),
    })),
  };

  const read = await draftReply(facts);
  if (!read.data) return NextResponse.json({ error: read.error }, { status: 400 });
  return NextResponse.json({ draft: read.data });
}
