import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { kimiJsonResult, kimiConfigured, kimiModel, kimiKeySource, kimiBaseUrl } from "@/lib/ai/kimi";
import { redactSecrets } from "@/lib/redact";

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

  // Deliberately trivial. This tests the key and the round trip, not the model:
  // anything cleverer would make a failure ambiguous between "the key is dead"
  // and "it answered something we did not expect".
  const result = await kimiJsonResult<{ ok: boolean; city: string }>({
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

  const { variable, fingerprint } = kimiKeySource();

  if (!result.answer) {
    return NextResponse.json({
      ok: false,
      model: kimiModel(),
      keyVariable: variable,
      keyFingerprint: fingerprint,
      baseUrl: kimiBaseUrl(),
      // The provider's own sentence, about **this** press.
      //
      // This used to say "the reason is in the failures list below" and point at
      // an undated list — so the one button built to answer the question
      // returned a forwarding address, and three rounds of "the key is still not
      // working" went past on it. `Incorrect API key provided` means one of four
      // things: revoked, mistyped, from another account, or issued on
      // api.moonshot.cn and being sent to api.moonshot.ai. That is why the
      // variable name and the endpoint travel with the message.
      error: redactSecrets(result.error ?? "The call did not come back."),
    });
  }

  return NextResponse.json({
    ok: true,
    model: kimiModel(),
    keyVariable: variable,
    keyFingerprint: fingerprint,
    ms: result.ms,
    answered: result.answer.city,
  });
}
