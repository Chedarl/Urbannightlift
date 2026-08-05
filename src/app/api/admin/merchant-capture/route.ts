import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { fromScreenshot, fromThread } from "@/lib/ai/merchantCapture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Read a business's details out of a screenshot or a pasted conversation.
 *
 * **This writes nothing.** It returns a draft, and the admin saves it through
 * the existing `POST /api/merchants` after checking every field — the same
 * two-step shape as the menu photo and the website menu-draft, and for the same
 * reason: this project has twice shipped a catalogue that was filled without a
 * human looking, and both times had to delete it.
 *
 * Two inputs, one output:
 *
 *  - `photoPath` — a screenshot of the business's own page, already uploaded to
 *    the private `merchant-captures` bucket through the normal signed-upload
 *    flow. Meta blocks reading their pages programmatically; nothing blocks
 *    photographing a screen you are lawfully looking at, and what comes out is
 *    factual contact information rather than anything of theirs republished.
 *  - `thread` — the WhatsApp conversation you were having anyway. Never stored;
 *    it is read once and the text is not persisted.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const photoPath = typeof body.photoPath === "string" ? body.photoPath.trim() : "";
  const thread = typeof body.thread === "string" ? body.thread.trim() : "";

  if (!photoPath && !thread) {
    return NextResponse.json({ error: "Give a screenshot or paste a conversation." }, { status: 400 });
  }

  const { draft, error, sawText } = photoPath
    ? await fromScreenshot(photoPath)
    : await fromThread(thread);

  if (!draft) {
    // The provider's own sentence, not a generic apology. The first version of
    // this said "Couldn't read that screenshot" while the real cause — we were
    // handing Moonshot a URL it does not accept — sat unread in a log.
    //
    // `sawText` goes back on failure too, and is the point: it separates "the
    // photograph was unreadable" from "it read the whole page and filled
    // nothing", which look identical on screen and need opposite fixes.
    return NextResponse.json({ draft: null, note: error ?? "Nothing came back.", sawText });
  }

  return NextResponse.json({
    draft,
    sawText,
    // Named plainly, because the speed of this is exactly what makes an
    // unchecked field dangerous — at fifteen seconds a business, it is very easy
    // to stop reading.
    note: "Read from the capture. Check every field — especially the phone number — before saving.",
  });
}
