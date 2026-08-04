import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { kimiJsonResult, kimiConfigured, kimiModel } from "@/lib/ai/kimi";
import { redactSecrets } from "@/lib/redact";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/ai/test-vision — send one image and see if it comes back read.
 *
 * **This is the check whose absence let five broken features ship green.**
 *
 * Receipts, payment proofs, menu boards, business screenshots and the pharmacy
 * duty roster were all built to hand Kimi a signed Supabase URL. Moonshot does
 * not accept remote image URLs — they must arrive as base64 — so none of them
 * could ever have returned anything. The one call that was proved end to end,
 * `admin.test`, sends no image at all, which is exactly why it stayed green
 * while every feature that mattered failed silently.
 *
 * A test that does not exercise the thing it vouches for is worse than no test.
 * So this one sends a real image, over the real path, with the real key.
 *
 * Deliberately no upload and no storage: the image is built here in a few bytes,
 * which means pressing this proves the *model and transport* work without
 * needing a catalogue, a bucket, or anything to have gone right first.
 */

/**
 * A 32×32 solid red PNG, hand-built so there is nothing to fetch.
 *
 * Red because it is unambiguous in any language, and because a model inventing
 * an answer would have no reason to land on it.
 */
const RED_SQUARE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAJElEQVR42u3NMQEAAAgDoC252H" +
  "3iBiRgcqvArwYJhUKhUCgUCoXiEbYAB/0/8lhTAAAAAElFTkSuQmCC";

export async function POST() {
  const user = await getSessionUser();
  if (!user || user.role !== "OWNER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!kimiConfigured()) {
    return NextResponse.json({
      ok: false,
      error: "No KIMI_API_KEY (or MOONSHOT_API_KEY) is set in Vercel.",
    });
  }

  const result = await kimiJsonResult<{ colour: string }>({
    purpose: "admin.test_vision",
    system:
      "You are being checked for image support. Answer with the single dominant colour of the image, in English, lower case.",
    user: "What colour is this image?",
    // The data URI, exactly as every real feature now sends one.
    images: [`data:image/png;base64,${RED_SQUARE_PNG}`],
    schema: {
      type: "object",
      required: ["colour"],
      properties: { colour: { type: "string" } },
    },
  });

  if (!result.answer) {
    return NextResponse.json({
      ok: false,
      model: kimiModel(),
      error: redactSecrets(result.error ?? "The call did not come back."),
    });
  }

  const colour = result.answer.colour.toLowerCase();
  const sawIt = colour.includes("red") || colour.includes("rouge");

  return NextResponse.json({
    ok: sawIt,
    model: kimiModel(),
    ms: result.ms,
    saw: result.answer.colour,
    // Answering with the wrong colour is its own diagnosis: the request went
    // through and something came back, but the image did not arrive intact.
    error: sawIt
      ? undefined
      : `It answered "${result.answer.colour}" for a plain red square, so the image is not reaching the model intact.`,
  });
}
