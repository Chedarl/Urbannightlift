import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { kimiJson, kimiConfigured, kimiModel } from "@/lib/ai/kimi";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/ai/test — make one real call and say what happened.
 *
 * The same idea as the test-email button, for the same reason. Every AI feature
 * here degrades silently by design: it returns null and the caller does what it
 * did before. That is correct, and it means a key that is missing, invalid, or
 * attached to an account with no credit is indistinguishable from a quiet night.
 *
 * This is the one place that difference is made visible on demand, without
 * waiting for a real order at 1 AM to exercise it.
 *
 * **OWNER only.** It spends money, however little, on request.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user || user.role !== "OWNER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!kimiConfigured()) {
    return NextResponse.json({
      ok: false,
      error:
        "No KIMI_API_KEY (or MOONSHOT_API_KEY) is set in Vercel. Add it there and redeploy — environment variables only take effect on a new deployment.",
    });
  }

  const started = Date.now();
  // Deliberately trivial. This tests the key and the round trip, not the model:
  // anything cleverer would make a failure ambiguous between "the key is dead"
  // and "it answered something we did not expect".
  const answer = await kimiJson<{ ok: boolean; city: string }>({
    purpose: "admin.test",
    system:
      "You are being checked for connectivity. Answer with ok set to true and city set to the city Urban Night Lift delivers in, which is Yaoundé.",
    user: "Are you reachable?",
    schema: {
      type: "object",
      required: ["ok", "city"],
      properties: { ok: { type: "boolean" }, city: { type: "string" } },
    },
  });

  if (!answer) {
    return NextResponse.json({
      ok: false,
      model: kimiModel(),
      // The detail is in the AiCall row this attempt just wrote, which the panel
      // is already showing underneath — so the reason is one line away rather
      // than duplicated here and left to drift.
      error:
        "The call did not come back. The reason is in the failures list below — most often an invalid key, or an account with no credit on it.",
    });
  }

  return NextResponse.json({
    ok: true,
    model: kimiModel(),
    ms: Date.now() - started,
    answered: answer.city,
  });
}
