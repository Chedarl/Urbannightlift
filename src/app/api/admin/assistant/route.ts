import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { getOperatingSettings } from "@/lib/settings";
import { yaoundeHour } from "@/lib/orders/tonight";
import { tonightWindow } from "@/lib/orders/tonight";
import { isNightHour } from "@/lib/pharmacy/tonight";
import { visibilityWhere } from "@/lib/orders/filters";
import { kimiStream, kimiConfigured } from "@/lib/ai/kimi";
import { partialReply, sse } from "@/lib/ai/partial";
import { redactSecrets } from "@/lib/redact";
import {
  attentionWhere,
  classifyAttention,
  ATTENTION_SELECT,
  OUT_ON_THE_ROAD,
} from "@/lib/orders/needsAttention";
import {
  staffSystemPrompt,
  STAFF_ANSWER_SCHEMA,
  type StaffAnswer,
  type StaffFacts,
} from "@/lib/ai/assistant/staffContext";
import { acceptStaffActions, staffRequest, isMutation } from "@/lib/ai/assistant/staffActions";
import { conversationBlock, shapeTurns } from "@/lib/ai/assistant/memory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The chat the owner asked for on the settings screen.
 *
 * There was none, and the reason was deliberate rather than an oversight: the
 * customer assistant is grounded in one customer's own orders, so on a
 * dispatcher's screen it would have been answering the wrong person out of the
 * wrong data. This is the staff one, grounded in the console's own rows.
 *
 * **It proposes; a person presses.** Every action it can offer maps to an
 * endpoint that already exists, which the browser calls with the staff session
 * it already has — so the role gate and the `AuditLog` entry are exactly the
 * ones the screens use, and the audit names the person, not the model. Nothing
 * here mints a permission, and there is deliberately no server-side execution
 * path for an action.
 *
 * Conversation history is **not stored** for staff. A dispatcher's console is
 * shared and a stored thread would follow whoever sat down next; the turns
 * travel in the request instead.
 */

/** A staff console is not an open door, but a runaway loop is still a bill. */
const STAFF_HOURLY_LIMIT = 120;
/** Enough of the queue to answer "what needs me", short enough to stay fast. */
const ATTENTION_LIMIT = 15;
/** Businesses nobody has confirmed for this long are worth mentioning. */
const STALE_MERCHANT_DAYS = 60;

const DAY_MS = 86_400_000;

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!kimiConfigured()) {
    return NextResponse.json({
      reply:
        "No Kimi key is configured, so I cannot answer. Everything on this screen still works — the panel above shows what is set and what is not.",
      actions: [],
    });
  }

  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 600) : "";
  if (question.length < 2) {
    return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  }

  const since = new Date(Date.now() - 3_600_000);
  const recent = await prisma.aiCall.count({
    where: { purpose: "assistant.staff", createdAt: { gte: since } },
  });
  if (recent >= STAFF_HOURLY_LIMIT) {
    return NextResponse.json({
      reply: "I have answered a great many questions this hour. Give it a few minutes.",
      actions: [],
    });
  }

  const settings = await getOperatingSettings();
  const now = Date.now();
  const hour = yaoundeHour();
  const { start, end } = tonightWindow(settings.operatingStartHour);
  const visible = visibilityWhere(false, settings.testMode);
  const staleCutoff = new Date(now - STALE_MERCHANT_DAYS * DAY_MS);

  const [tonightOrders, attention, unverified, stale, cases, riders, gaps, failures] = await Promise.all([
    prisma.order.findMany({
      where: { ...visible, createdAt: { gte: start, lt: end } },
      select: { orderStatus: true },
    }),
    // The same query and the same classifier the dashboard panel uses, so the
    // assistant and the panel cannot disagree about what is wrong tonight.
    prisma.order.findMany({
      where: attentionWhere(visible, now),
      orderBy: { createdAt: "asc" },
      take: ATTENTION_LIMIT,
      select: ATTENTION_SELECT,
    }),
    prisma.merchant.findMany({
      where: { verified: false, active: true },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { id: true, merchantName: true, neighbourhood: true, createdAt: true },
    }),
    prisma.merchant.findMany({
      where: {
        verified: true,
        active: true,
        OR: [{ lastConfirmedAt: null }, { lastConfirmedAt: { lt: staleCutoff } }],
      },
      orderBy: { lastConfirmedAt: "asc" },
      take: 8,
      select: { id: true, merchantName: true, lastConfirmedAt: true, createdAt: true },
    }),
    prisma.supportRequest.findMany({
      where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
      orderBy: { lastCustomerMessageAt: "asc" },
      take: 10,
      select: {
        id: true,
        category: true,
        message: true,
        orderCode: true,
        lastCustomerMessageAt: true,
        createdAt: true,
        customer: { select: { fullName: true } },
        fullName: true,
      },
    }),
    prisma.user.findMany({
      where: { role: "RIDER", status: "ACTIVE" },
      take: 15,
      select: {
        id: true,
        fullName: true,
        isOnline: true,
        assignedOrders: {
          where: { orderStatus: { in: OUT_ON_THE_ROAD } },
          select: { id: true },
        },
      },
    }),
    prisma.addressResolutionLog.groupBy({
      by: ["rawText"],
      where: { resolved: false, createdAt: { gte: new Date(now - 30 * DAY_MS) } },
      _count: { rawText: true },
      orderBy: { _count: { rawText: "desc" } },
      take: 8,
    }),
    prisma.aiCall.findMany({
      where: { ok: false, createdAt: { gte: new Date(now - 7 * DAY_MS) } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { purpose: true, error: true },
    }),
  ]);

  const attentionRows = attention.map((o) => classifyAttention(o, now));

  const facts: StaffFacts = {
    staffName: user.fullName?.split(" ")[0] ?? "there",
    role: user.role,
    hoursText: `${settings.operatingStartHour}:00 to ${settings.operatingEndHour}:00`,
    openNow: isNightHour(hour, settings.operatingStartHour, settings.operatingEndHour),
    testMode: settings.testMode,
    tonight: {
      orders: tonightOrders.length,
      delivered: tonightOrders.filter((o) => o.orderStatus === "DELIVERED" || o.orderStatus === "CLOSED").length,
      inProgress: tonightOrders.filter((o) => OUT_ON_THE_ROAD.includes(o.orderStatus)).length,
    },
    attention: attentionRows,
    unverifiedMerchants: unverified.map((m) => ({
      id: m.id,
      name: m.merchantName,
      neighbourhood: m.neighbourhood,
      daysWaiting: Math.floor((now - m.createdAt.getTime()) / DAY_MS),
    })),
    staleMerchants: stale.map((m) => ({
      id: m.id,
      name: m.merchantName,
      daysSinceConfirmed: Math.floor((now - (m.lastConfirmedAt ?? m.createdAt).getTime()) / DAY_MS),
    })),
    cases: cases.map((c) => ({
      id: c.id,
      // There is no subject column — a case is a category plus what they wrote,
      // so the first line of the message is the subject a human would read.
      subject: `${c.category}${c.orderCode ? ` on ${c.orderCode}` : ""}: ${c.message.slice(0, 90)}`,
      customerName: c.customer?.fullName ?? c.fullName,
      hoursWaiting: Math.floor((now - (c.lastCustomerMessageAt ?? c.createdAt).getTime()) / 3_600_000),
    })),
    riders: riders.map((r) => ({
      id: r.id,
      name: r.fullName,
      online: r.isOnline,
      activeOrders: r.assignedOrders.length,
    })),
    failingAddresses: gaps.map((g) => ({ text: g.rawText, times: g._count.rawText })),
    // The provider's own words, redacted. A dispatcher asking "why is the
    // capture failing" should get the reason, not a pointer at a list.
    aiFailures: failures.map((f) => ({
      purpose: f.purpose,
      error: redactSecrets(f.error ?? "no reason recorded").slice(0, 200),
    })),
  };

  const history = shapeTurns(body.history);

  /*
   * Streamed, for the same reason the customer's is.
   *
   * A dispatcher asking "what needs me right now?" at 1 AM watched a spinner
   * for five to eight seconds, which is exactly as long as it takes to decide a
   * screen is broken — and half of why the admin end was reported as not
   * working. The words now arrive as they are written.
   *
   * What does **not** move is the part that matters: `acceptStaffActions` still
   * runs on the whole object at the end, checking every id against the rows
   * this route itself just loaded. A model asked to be helpful will invent an
   * order id, and an invented id inside a "put Jean on this" button is a rider
   * sent to the wrong customer. Nothing about that moved to the browser.
   */
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let shown = "";

      const result = await kimiStream(
        {
          purpose: "assistant.staff",
          system: `${staffSystemPrompt(facts)}\n\n${conversationBlock(history)}`,
          user: question,
          schema: STAFF_ANSWER_SCHEMA as unknown as Record<string, unknown>,
        },
        {
          onDelta(text) {
            buffer += text;
            const next = partialReply(buffer);
            // Only the new characters, so the browser appends rather than
            // re-rendering a growing string on every token.
            if (next.length > shown.length) {
              controller.enqueue(encoder.encode(sse("delta", { text: next.slice(shown.length) })));
              shown = next;
            }
          },
        }
      );

      function finish(reply: string, actions: unknown[]) {
        controller.enqueue(encoder.encode(sse("done", { reply, actions })));
        controller.close();
      }

      if (!result.answer) {
        finish(`I couldn't answer just then${result.error ? ` — ${redactSecrets(result.error)}` : "."}`, []);
        return;
      }

      let answer: StaffAnswer | null = null;
      try {
        answer = JSON.parse(result.answer) as StaffAnswer;
      } catch {
        // The stream finished with something that is not an object. Whatever
        // was written stands; no buttons, because there is nothing to check
        // them against — and an unchecked staff button is the one thing here
        // that could actually do damage.
        finish(shown, []);
        return;
      }

      const actions = acceptStaffActions(answer.actions, {
        orderIds: attentionRows.map((a) => a.id),
        merchantIds: [...unverified.map((m) => m.id), ...stale.map((m) => m.id)],
        caseIds: cases.map((c) => c.id),
        customerIds: [],
        riderIds: riders.map((r) => r.id),
      });

      finish(
        (answer.reply ?? shown).slice(0, 1200),
        // The button, described. Executing it is the browser's job, with the
        // staff session — so the endpoint's own gate decides, exactly as it
        // does on the screen this saves a walk to.
        actions.map((a) => ({
          label: a.label,
          mutation: isMutation(a.kind),
          request: staffRequest(a),
        }))
      );
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
