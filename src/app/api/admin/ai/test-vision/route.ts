import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { kimiJsonResult, kimiConfigured, kimiModel } from "@/lib/ai/kimi";
import { redactSecrets } from "@/lib/redact";
import { visionTestImage } from "@/lib/ai/testImage";
import { readImage } from "@/lib/ai/images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/ai/test-vision — walk the whole capture chain and say where
 * it stops.
 *
 * **Every failure this round came from the same habit: a stage nobody executed,
 * asserted to work.** Five vision features shipped sending a URL the provider
 * does not accept. The button built to catch that sent a base64 string that was
 * not a PNG. Both were caught only when somebody finally ran them.
 *
 * So this does not test the last link, it walks all four:
 *
 *   1. build a real PNG                     (proved offline by verify-image-payload)
 *   2. upload it to `merchant-captures`     ← the bucket the capture writes to
 *   3. read it back with `readImage`        ← download, allow-list, magic-number sniff
 *   4. send that data URI to Kimi           ← transport, decoder, comprehension
 *
 * Stage 3 is the one that has never once been exercised. It is also the one the
 * screenshot capture depends on entirely, and it uses **`readImage` itself** —
 * not a parallel copy — because a check that exercises different code from the
 * thing it vouches for is what made the last one worthless.
 *
 * The test object is deleted afterwards. If deletion fails it is left alone
 * rather than failing the check: a stray 96-byte file in a private staff bucket
 * is not worth reporting a false red for.
 */

interface Stage {
  name: string;
  ok: boolean;
  detail: string;
}

export async function POST() {
  const user = await getSessionUser();
  if (!user || user.role !== "OWNER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!kimiConfigured()) {
    return NextResponse.json({
      ok: false,
      error: "No KIMI_API_KEY (or MOONSHOT_API_KEY) is set in Vercel.",
      stages: [],
    });
  }

  const stages: Stage[] = [];
  const fail = (error: string) =>
    NextResponse.json({ ok: false, model: kimiModel(), stages, error });

  // 1 — the image. Built rather than recalled; a hand-written base64 constant
  // is what broke the previous version of this button.
  // Only the bytes are wanted here. Stage 4 deliberately sends the copy that
  // came back **out of storage**, so what is tested is the payload a real
  // screenshot produces rather than one this route built a moment ago.
  const { bytes } = visionTestImage();
  stages.push({ name: "Built a test image", ok: true, detail: `${bytes.length} bytes of PNG` });

  // 2 — into the same bucket the screenshot capture writes to.
  const key = `selftest/${Date.now()}-vision.png`;
  const path = `merchant-captures/${key}`;
  try {
    const admin = createAdminClient();
    const { error } = await admin.storage
      .from("merchant-captures")
      .upload(key, bytes, { contentType: "image/png", upsert: true });
    if (error) {
      stages.push({ name: "Uploaded to storage", ok: false, detail: error.message });
      return fail(
        `Storage refused the upload: ${error.message}. If it says the bucket does not exist, run the DB-setup Action — that is what creates it.`
      );
    }
    stages.push({ name: "Uploaded to storage", ok: true, detail: "merchant-captures" });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown error";
    stages.push({ name: "Uploaded to storage", ok: false, detail });
    return fail(`Couldn't reach storage: ${detail}`);
  }

  // 3 — the stage that has never been exercised, through the very function the
  // capture uses. Download, allow-list, size cap, magic-number sniff.
  const image = await readImage(path);
  if (!image.dataUrl) {
    stages.push({ name: "Read it back", ok: false, detail: image.problem ?? "no reason given" });
    return fail(
      `Read it back and got nothing: ${image.problem ?? "no reason given"}. This is the step the screenshot capture depends on.`
    );
  }
  stages.push({
    name: "Read it back",
    ok: true,
    detail: `${image.bytes} bytes, sniffed as ${image.mime}`,
  });

  // 4 — the model, on the data URI that came out of storage rather than the one
  // built in memory, so this is the exact payload a real screenshot produces.
  const result = await kimiJsonResult<{ colour: string }>({
    purpose: "admin.test_vision",
    system:
      "You are being checked for image support. Answer with the single dominant colour of the image, in English, lower case.",
    user: "What colour is this image?",
    images: [image.dataUrl],
    schema: {
      type: "object",
      required: ["colour"],
      properties: { colour: { type: "string" } },
    },
  });

  // Tidy up. A failure here is not the owner's problem and must not turn a
  // green check red.
  void createAdminClient()
    .storage.from("merchant-captures")
    .remove([key])
    .catch(() => {});

  if (!result.answer) {
    stages.push({
      name: "Kimi read it",
      ok: false,
      detail: redactSecrets(result.error ?? "no answer"),
    });
    return fail(redactSecrets(result.error ?? "The call did not come back."));
  }

  const colour = result.answer.colour.toLowerCase();
  const sawIt = colour.includes("red") || colour.includes("rouge");
  stages.push({
    name: "Kimi read it",
    ok: sawIt,
    detail: `answered "${result.answer.colour}" in ${result.ms}ms`,
  });

  return NextResponse.json({
    ok: sawIt,
    model: kimiModel(),
    ms: result.ms,
    saw: result.answer.colour,
    stages,
    // The wrong colour is its own diagnosis: everything moved, but the picture
    // did not arrive intact.
    error: sawIt
      ? undefined
      : `It answered "${result.answer.colour}" for a plain red square, so the image is not reaching the model intact.`,
  });
}
