import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerId } from "@/lib/auth/customer";
import { getOperatingSettings } from "@/lib/settings";
import { yaoundeHour } from "@/lib/orders/tonight";
import { isNightHour } from "@/lib/pharmacy/tonight";
import { kimiJsonResult, kimiConfigured } from "@/lib/ai/kimi";
import { acceptActions } from "@/lib/ai/assistant/actions";
import {
  systemPrompt,
  ANSWER_SCHEMA,
  feeText,
  type AssistantAnswer,
  type AssistantFacts,
} from "@/lib/ai/assistant/context";
import { serviceLabels } from "@/lib/ai/assistant/labels";
import { customerStatusDictKey } from "@/lib/orders/statusLabels";
import { translate } from "@/lib/i18n";
import { shapeTurns, retentionCutoff, MAX_TURNS, type Turn } from "@/lib/ai/assistant/memory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The assistant, answering only from what we handed it.
 *
 * Everything reachable here is loaded **from the session**, never from anything
 * the customer or the model said. A signed-out visitor's context contains no
 * order data at all — not filtered, absent — because the owner chose to put this
 * on the public site and a filter is something that eventually gets got round.
 *
 * **Not streamed, deliberately.** The plan said stream, and for a plain chat it
 * would be right: the key answers a trivial question in about five seconds. But
 * this answer is structured — a reply *plus* a set of proposed buttons — and
 * streaming that means either showing a customer raw JSON or parsing half-formed
 * JSON as it arrives. Both are worse than a spinner that says what it is doing.
 * The wait is named on screen instead.
 */

/** Cost control on the open door. Counted against the calls we already log. */
const PUBLIC_HOURLY_LIMIT = 20;
const SIGNED_IN_HOURLY_LIMIT = 60;

/**
 * GET — the conversation as it stood when they last closed the sheet.
 *
 * Without this, "it remembers" would be true and invisible: the model would
 * follow on from something the customer could no longer see, which reads as the
 * assistant knowing things it should not. The screen and the prompt have to be
 * looking at the same conversation.
 *
 * Signed out, this is always empty — nothing is stored for a visitor.
 */
export async function GET() {
  const customerId = await getCustomerId();
  if (!customerId) return NextResponse.json({ turns: [] });

  const rows = await prisma.assistantTurn.findMany({
    where: { customerId, createdAt: { gte: retentionCutoff() } },
    orderBy: { createdAt: "desc" },
    take: MAX_TURNS,
    select: { role: true, text: true },
  });
  return NextResponse.json({ turns: rows.reverse() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 600) : "";
  const fr = body.fr === true;

  // Read the language before answering anything. This reply used to be English
  // only, so a French speaker asking a French question got an English refusal.
  if (!kimiConfigured()) {
    return NextResponse.json({
      reply: fr
        ? "L'assistant n'est pas activé pour le moment. La page d'aide contient l'essentiel, et une personne lit chaque message qui en part."
        : "The assistant is not switched on right now. The help page has the answers, and a person reads every message sent from it.",
      actions: [],
    });
  }

  if (question.length < 2) {
    return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  }

  const customerId = await getCustomerId();
  const signedIn = Boolean(customerId);

  // An hour's worth of calls, from the table every call already writes to. No
  // new model, no new counter to drift — and the public path is held far
  // tighter than the signed-in one, because a chat box on a landing page is an
  // open door onto somebody else's balance.
  const since = new Date(Date.now() - 3_600_000);
  const recent = await prisma.aiCall.count({
    where: { purpose: signedIn ? "assistant.customer" : "assistant.public", createdAt: { gte: since } },
  });
  if (recent >= (signedIn ? SIGNED_IN_HOURLY_LIMIT : PUBLIC_HOURLY_LIMIT)) {
    return NextResponse.json({
      reply: fr
        ? "L'assistant est très sollicité en ce moment. La page d'aide répond à la plupart des questions, et une personne lit chaque message."
        : "The assistant is busy right now. The help page answers most things, and a person reads every message sent from it.",
      actions: [],
    });
  }

  const settings = await getOperatingSettings();
  const hour = yaoundeHour();
  const openNow = isNightHour(hour, settings.operatingStartHour, settings.operatingEndHour);

  const [zones, openMerchants, orders, places, customer, stored] = await Promise.all([
    prisma.zone.findMany({
      where: { active: true },
      select: { zoneName: true, feeXaf: true },
      orderBy: { feeXaf: "asc" },
      take: 20,
    }),
    prisma.merchant.findMany({
      where: { verified: true, active: true, acceptingOrders: true },
      select: { merchantName: true, category: true, neighbourhood: true, nightOpen: true, open24h: true },
      take: 20,
    }),
    // Loaded from the session's customer id, so there is no query the model or
    // the caller can steer. A signed-out visitor skips this entirely.
    customerId
      ? prisma.order.findMany({
          where: { customerId },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            orderCode: true,
            serviceType: true,
            orderStatus: true,
            createdAt: true,
            estimatedDeliveryFeeXaf: true,
            finalDeliveryFeeXaf: true,
            // Note what is NOT selected: otpCode. It is not filtered out later,
            // it never leaves the database.
          },
        })
      : Promise.resolve([]),
    customerId
      ? prisma.customerAddress.findMany({
          where: { customerId },
          select: { id: true, label: true },
          take: 8,
        })
      : Promise.resolve([]),
    customerId
      ? prisma.customer.findUnique({ where: { id: customerId }, select: { fullName: true } })
      : Promise.resolve(null),
    // The conversation so far — stored for a signed-in customer, so it picks up
    // where it left off. Ordered newest first and reversed below, because that
    // is the cheap end of the index when only the tail is wanted.
    customerId
      ? prisma.assistantTurn.findMany({
          where: { customerId, createdAt: { gte: retentionCutoff() } },
          orderBy: { createdAt: "desc" },
          take: MAX_TURNS,
          select: { role: true, text: true },
        })
      : Promise.resolve([]),
  ]);

  // A signed-out visitor has nothing stored, so their follow-ups arrive from
  // their own browser — untrusted, and shaped as such. A signed-in customer's
  // history comes from the database and the browser's copy is ignored, so
  // nothing a caller sends can put words in our mouth.
  const history: Turn[] = customerId
    ? stored.reverse().map((t) => ({ role: t.role === "unl" ? "unl" : "you", text: t.text }))
    : shapeTurns(body.history);

  const labels = serviceLabels(fr);
  const services = settings.enabledServices.map((type) => ({
    type,
    label: labels[type] ?? type,
  }));

  const facts: AssistantFacts = {
    fr,
    signedIn,
    firstName: customer?.fullName?.split(" ")[0] ?? null,
    hoursText: `${settings.operatingStartHour}:00 to ${settings.operatingEndHour}:00`,
    openNow,
    services,
    fees: zones.map((z) => ({ zone: z.zoneName, feeText: feeText(z.feeXaf) })),
    orders: orders.map((o) => ({
      orderCode: o.orderCode,
      service: labels[o.serviceType] ?? o.serviceType,
      // The same nine words the customer already sees on their own order, in
      // the language they are speaking. Handing the model the raw enum gave a
      // French conversation "rider_arrived_at_delivery" to paraphrase, and it
      // would also have described the order in language the customer has never
      // been shown.
      status: translate(fr ? "fr" : "en", customerStatusDictKey(o.orderStatus)),
      placedAt: o.createdAt.toISOString().slice(0, 10),
      // Pre-formatted by us. The model is told to quote, never to calculate.
      // The settled fee where there is one, the estimate otherwise — the same
      // figure the customer was shown, never one worked out here.
      totalText:
        o.finalDeliveryFeeXaf != null
          ? feeText(o.finalDeliveryFeeXaf)
          : o.estimatedDeliveryFeeXaf != null
            ? feeText(o.estimatedDeliveryFeeXaf)
            : null,
    })),
    places: places.map((p) => ({ id: p.id, label: p.label })),
    openMerchants: openMerchants
      .filter((m) => m.open24h || (openNow && m.nightOpen))
      .map((m) => ({ name: m.merchantName, category: m.category, neighbourhood: m.neighbourhood })),
    history,
  };

  const result = await kimiJsonResult<AssistantAnswer>({
    purpose: signedIn ? "assistant.customer" : "assistant.public",
    system: systemPrompt(facts),
    user: question,
    schema: ANSWER_SCHEMA as unknown as Record<string, unknown>,
  });

  if (!result.answer) {
    // Degrades to the honest thing rather than an error: a person reads the
    // help form, and saying so is a better answer than a spinner that stops.
    return NextResponse.json({
      reply: fr
        ? "Je n'ai pas pu répondre à l'instant. La page d'aide contient l'essentiel, et une personne lit chaque message."
        : "I couldn't answer just then. The help page covers most things, and a person reads every message sent from it.",
      actions: [],
    });
  }

  const reply = result.answer.reply.slice(0, 1200);

  // Remember it, for a signed-in customer only. Failing to write must never
  // cost them the answer they are already looking at, so this is awaited but
  // swallowed — a conversation that forgets one exchange is a small loss; an
  // error page instead of an answer is not.
  if (customerId) {
    await prisma
      .$transaction([
        prisma.assistantTurn.createMany({
          data: [
            { customerId, role: "you", text: question },
            { customerId, role: "unl", text: reply },
          ],
        }),
        // Retention happens on the way past rather than in a job nobody runs.
        prisma.assistantTurn.deleteMany({
          where: { customerId, createdAt: { lt: retentionCutoff() } },
        }),
      ])
      .catch(() => {});
  }

  return NextResponse.json({
    reply,
    // Checked against a scope built from the session — an order code the model
    // invented, or one belonging to somebody else, never becomes a button.
    actions: acceptActions(result.answer.actions, {
      orderCodes: facts.orders.map((o) => o.orderCode),
      addressIds: facts.places.map((p) => p.id),
      services: facts.services.map((s) => s.type),
      signedIn,
    }),
  });
}
