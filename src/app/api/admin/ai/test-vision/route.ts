import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { kimiJsonResult, kimiConfigured, kimiModel } from "@/lib/ai/kimi";
import { redactSecrets } from "@/lib/redact";
import { visionTestImage } from "@/lib/ai/testImage";
import { sniffImageMime } from "@/lib/ai/images";

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

  // Built here rather than recalled. The previous version of this button sent a
  // base64 string I wrote from memory which was not a valid PNG at all — the
  // check meant to catch unproved features was itself unproved.
  const { bytes, dataUrl } = visionTestImage();
  const sniffed = sniffImageMime(bytes);

  // What we sent, reported alongside whatever comes back, so a failure arrives
  // already diagnosed instead of starting another round of guessing.
  const sent = {
    bytes: bytes.length,
    mime: sniffed,
    head: bytes.subarray(0, 8).toString("hex"),
  };

  const result = await kimiJsonResult<{ colour: string }>({
    purpose: "admin.test_vision",
    system:
      "You are being checked for image support. Answer with the single dominant colour of the image, in English, lower case.",
    user: "What colour is this image?",
    // The data URI, exactly as every real feature now sends one.
    images: [dataUrl],
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
      sent,
      error: `${redactSecrets(result.error ?? "The call did not come back.")} — we sent ${sent.bytes} bytes, sniffed as ${sent.mime ?? "not an image"}, starting ${sent.head}.`,
    });
  }

  const colour = result.answer.colour.toLowerCase();
  const sawIt = colour.includes("red") || colour.includes("rouge");

  return NextResponse.json({
    ok: sawIt,
    model: kimiModel(),
    ms: result.ms,
    saw: result.answer.colour,
    sent,
    // Answering with the wrong colour is its own diagnosis: the request went
    // through and something came back, but the image did not arrive intact.
    error: sawIt
      ? undefined
      : `It answered "${result.answer.colour}" for a plain red square, so the image is not reaching the model intact.`,
  });
}
