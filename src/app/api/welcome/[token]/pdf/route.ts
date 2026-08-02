import { NextRequest, NextResponse } from "next/server";
import { readWelcomeToken } from "@/lib/welcome/card";
import { loadWelcome } from "@/lib/welcome/deliver";
import { renderWelcomeCardBuffer } from "@/components/shared/welcomeCard";

export const dynamic = "force-dynamic";
// @react-pdf/renderer needs real Node — it is not edge-safe.
export const runtime = "nodejs";

/**
 * GET /api/welcome/[token]/pdf — the card as a real file.
 *
 * A `wa.me` link cannot carry an attachment, so the welcome travels as a link
 * and this is what the link is worth opening for. Server-rendered from the same
 * component the browser uses, so the file somebody is sent and the file they
 * download from the page can never be two different documents.
 *
 * The token is the whole authorization. Forged, mangled or expired is a 404 —
 * not a 401, because the existence of a particular person's card is not
 * something to confirm to somebody guessing at URLs.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = readWelcomeToken(token);
  if (!claim) return new NextResponse("Not found", { status: 404 });

  const welcome = await loadWelcome(claim.kind, claim.id);
  if (!welcome) return new NextResponse("Not found", { status: 404 });

  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://urbannighlift.com").replace(/\/+$/, "");

  // Try it with the logo; fall back without. react-pdf fetches the image while
  // rendering, so a slow or missing asset would otherwise be the reason
  // somebody's welcome 500s — and a card with a typographic masthead and no
  // logo is a perfectly good card.
  let pdf: Buffer;
  try {
    pdf = await renderWelcomeCardBuffer({ ...welcome.card, logoSrc: `${site}/logo.png` });
  } catch {
    pdf = await renderWelcomeCardBuffer({ ...welcome.card, logoSrc: null });
  }

  const name = welcome.card.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "card";

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // inline: on a phone this opens in the viewer, which is what somebody
      // tapping a WhatsApp link expects. They can still save it from there.
      "Content-Disposition": `inline; filename="urban-night-lift-${name}.pdf"`,
      // The card changes when the referral terms or the operating hours change,
      // and it is cheap to rebuild. Private, because it names a person.
      "Cache-Control": "private, max-age=300",
    },
  });
}
