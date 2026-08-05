import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerId } from "@/lib/auth/customer";
import { getOperatingSettings } from "@/lib/settings";
import { yaoundeHour } from "@/lib/orders/tonight";
import { isNightHour } from "@/lib/pharmacy/tonight";
import { kimiStream, kimiConfigured } from "@/lib/ai/kimi";
import { acceptActions } from "@/lib/ai/assistant/actions";
import { partialReply, sse } from "@/lib/ai/partial";
import {
  systemPrompt,
  ANSWER_SCHEMA,
  feeText,
  acceptFollowUps,
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
 * **Streamed, without giving up the schema.** This did not stream for a real
 * reason: the answer is structured — a reply *plus* proposed buttons — and that
 * structure is what makes the buttons safe. But a spinner for five to eight
 * seconds reads as broken however honest it is, and "it does not work like other
 * chat systems" was the fair verdict.
 *
 * So the JSON is streamed and `partialReply` pulls the growing `reply` string
 * out of it as it arrives. The words appear as they are written; the whole
 * object still lands at the end and every guard runs on it, unchanged. Nothing
 * about who may press what moved to the browser.
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

  /*
   * Streamed, at last, and the reason it was not is worth keeping in view.
   *
   * The answer is a JSON object — a reply plus proposed buttons — and that shape
   * is what makes the buttons safe: each one is checked against what this asker
   * actually owns before it is drawn. So streaming could not mean giving up the
   * schema. It means pulling the growing `reply` string out of the incomplete
   * JSON as it arrives (`partialReply`), sending that, and running every guard
   * unchanged on the whole object at the end.
   *
   * The words appear as they are written. Nothing about who may press what
   * moved to the browser.
   */
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let shown = "";

      const result = await kimiStream(
        {
          purpose: signedIn ? "assistant.customer" : "assistant.public",
          system: systemPrompt(facts),
          user: question,
          schema: ANSWER_SCHEMA as unknown as Record<string, unknown>,
        },
        {
          onDelta(text) {
            buffer += text;
            const next = partialReply(buffer);
            // Only ever the new characters, so the browser appends rather than
            // re-rendering a growing string on every token.
            if (next.length > shown.length) {
              controller.enqueue(encoder.encode(sse("delta", { text: next.slice(shown.length) })));
              shown = next;
            }
          },
        }
      );

      if (!result.answer) {
        controller.enqueue(
          encoder.encode(
            sse("done", {
              reply: fr
                ? "Je n'ai pas pu répondre à l'instant. La page d'aide contient l'essentiel, et une personne lit chaque message."
                : "I couldn't answer just then. The help page covers most things, and a person reads every message sent from it.",
              actions: [],
              followUps: [],
            })
          )
        );
        controller.close();
        return;
      }

      let answer: AssistantAnswer | null = null;
      try {
        answer = JSON.parse(result.answer) as AssistantAnswer;
      } catch {
        // The stream finished with something that is not an object. Whatever
        // was shown on screen is what they get; no buttons, because there is
        // nothing to check them against.
        controller.enqueue(
          encoder.encode(sse("done", { reply: shown, actions: [], followUps: [] }))
        );
        controller.close();
        return;
      }

      const reply = (answer.reply ?? shown).slice(0, 1200);

      // Unchanged: checked against a scope built from the session, so an order
      // code the model invented — or one belonging to somebody else — never
      // becomes a button.
      const actions = acceptActions(answer.actions, {
        orderCodes: facts.orders.map((o) => o.orderCode),
        addressIds: facts.places.map((p) => p.id),
        services: facts.services.map((s) => s.type),
        signedIn,
      });

      controller.enqueue(
        encoder.encode(sse("done", { reply, actions, followUps: acceptFollowUps(answer.followUps) }))
      );
      controller.close();

      // Remember it, for a signed-in customer only, after the answer is on its
      // way. Failing to write must never cost them the answer they are already
      // reading.
      if (customerId) {
        await prisma
          .$transaction([
            prisma.assistantTurn.createMany({
              data: [
                { customerId, role: "you", text: question },
                { customerId, role: "unl", text: reply },
              ],
            }),
            prisma.assistantTurn.deleteMany({
              where: { customerId, createdAt: { lt: retentionCutoff() } },
            }),
          ])
          .catch(() => {});
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
