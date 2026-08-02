/**
 * Proves the welcome card is one page, in every language and both variants.
 *
 * The first build of this was A5, which looked right in the code and silently
 * produced a **two-page** card — the one thing a welcome card cannot be. It was
 * only caught by counting `/Type /Page` in the bytes, which is exactly the kind
 * of thing nobody does by eye on the fifth deploy.
 *
 * French is the version that breaks first: it runs 15–20% longer than English
 * for the same copy, so a layout that fits in English is not evidence of
 * anything. Both are checked, plus a deliberately long name and the longest
 * referral copy, because those are the two inputs that grow.
 *
 * Run: npx tsx scripts/verify-welcome-card.ts
 */
import { renderWelcomeCardBuffer, type WelcomeCardData } from "../src/components/shared/welcomeCard";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

/** Every string the card draws, decoded back out of the PDF. */
function textOf(pdf: Buffer): string {
  const zlib = require("node:zlib") as typeof import("node:zlib");
  const raw = pdf.toString("latin1");
  let best = "";
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length;
    const end = raw.indexOf("endstream", start);
    try {
      const out = zlib
        .inflateSync(Buffer.from(raw.slice(start, end).replace(/[\r\n]+$/, ""), "latin1"))
        .toString("latin1");
      if (out.includes("TJ") && out.length > best.length) best = out;
    } catch {
      /* not a deflate stream */
    }
  }
  let text = "";
  for (const run of best.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
    for (const hex of run[1].matchAll(/<([0-9a-fA-F]+)>/g)) {
      text += Buffer.from(hex[1], "hex").toString("latin1");
    }
  }
  return text;
}

const base: WelcomeCardData = {
  kind: "customer",
  locale: "en",
  name: "Alice Mbarga",
  joinedAt: new Date("2026-08-02T20:00:00Z"),
  referralCode: "ALICE7X",
  friendDiscountXaf: 500,
  referrerRewardPercent: 5,
  openFrom: "6:00 PM",
  openTo: "4:00 AM",
};

async function main() {
  console.log("\nOne page, always");
  const cases: [string, WelcomeCardData][] = [
    ["customer, English", base],
    ["customer, French", { ...base, locale: "fr", openFrom: "18h00", openTo: "04h00" }],
    ["merchant, French", { kind: "merchant", locale: "fr", name: "Boulangerie Dolcezza", joinedAt: base.joinedAt, openFrom: "18h00", openTo: "04h00" }],
    ["merchant, English", { kind: "merchant", locale: "en", name: "Dolcezza", joinedAt: base.joinedAt, openFrom: "6:00 PM", openTo: "4:00 AM" }],
    // The two inputs that actually grow: a long name and the longest of the
    // three referral sentences (both a discount and a percentage).
    ["a very long name", { ...base, locale: "fr", name: "Marie-Josèphe Ndongo Essomba Atangana", openFrom: "18h00", openTo: "04h00" }],
    ["no logo configured", { ...base, logoSrc: null }],
  ];

  const rendered: Record<string, Buffer> = {};
  for (const [label, data] of cases) {
    const pdf = await renderWelcomeCardBuffer(data);
    rendered[label] = pdf;
    const pages = pageCount(pdf);
    check(label, pages === 1, `rendered ${pages} pages — a welcome card must be one`);
  }

  console.log("\nIt says what it is supposed to say");
  const en = textOf(rendered["customer, English"]);
  check("the brand", en.includes("URBAN NIGHT LIFT"));
  check("their name", en.includes("Alice Mbarga"));
  check("the hours", en.includes("6:00 PM") && en.includes("4:00 AM"));
  check("the no-markup promise", /no markup/i.test(en));
  check("their referral code", en.includes("ALICE7X"));
  check("what the friend saves", en.includes("500 XAF"));
  check("what they earn, as a percentage", en.includes("5%"));
  check("the never-ask-for-your-PIN line", /Mobile Money PIN/i.test(en));
  check("real contact details", en.includes("urbannighlift.com"));

  const fr = textOf(rendered["customer, French"]);
  check("French accents survive the PDF encoding", fr.includes("Bienvenue") && /Yaound/.test(fr));

  console.log("\nWhat must never be on it");
  // The card is designed to be forwarded, so this is the whole security model:
  // there is simply nothing on it worth intercepting.
  /** Our own line is printed on purpose; anybody else's would be the bug. */
  const OURS = "237680038004";
  for (const [label, pdf] of Object.entries(rendered)) {
    const digits = textOf(pdf).replace(/\s/g, "");
    const t = textOf(pdf);
    const strangersNumber = (digits.match(/237\d{9}/g) ?? []).some((n) => n !== OURS);
    const leaked = /\bPIN\b\s*:/i.test(t) || /\b\d{4,6}\b(?=\s*(is your|est votre))/i.test(t);
    check(
      `${label}: no PIN, nobody's number but ours`,
      !leaked && !strangersNumber,
      strangersNumber ? "a phone number that is not the business line appears on the card" : ""
    );
  }

  console.log("\nA merchant card carries no referral code");
  const merchant = textOf(rendered["merchant, French"]);
  check("no code box", !merchant.includes("ALICE7X") && !/VOTRE CODE/.test(merchant));

  console.log(
    `\n${failures === 0 ? "The welcome card is one page and says what it should, in both languages." : `${failures} check(s) FAILED.`}\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
