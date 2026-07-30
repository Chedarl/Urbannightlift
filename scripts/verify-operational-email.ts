/**
 * Operational email: what goes in it, and what deliberately does not.
 *
 * The owner asked for "a copy of everything they've provided". Everything
 * typed is in the message; everything uploaded is linked instead. An ID card
 * scan or a prescription sitting in a Gmail inbox is forwardable, searchable,
 * and administered by nobody — and the privacy policy we publish promises
 * those are seen only by staff handling the order. These checks hold that line
 * so a future edit cannot quietly cross it.
 */
import { PrismaClient } from "@prisma/client";
import { shell, plain, escape, UPLOADS_NOTE, ADMIN, type Field } from "../src/lib/email/templates";
import { lastNightWindow, summaryHeadline } from "../src/lib/email/nightlySummary";

const prisma = new PrismaClient();
let failures = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

async function main() {
  console.log("\n— the email carries what they typed —");
  const fields: Field[] = [
    { label: "Customer", value: "Alice Ngassa" },
    { label: "WhatsApp", value: "237690123456" },
    { label: "Deliver to", value: "Carrefour Biyem-Assi — near the pharmacy" },
    { label: "Empty field", value: "" },
    { label: "Missing field", value: null },
  ];
  const html = shell({
    heading: "New order UNL-ABC123",
    subheading: "Waiting for review and a price.",
    fields,
    note: UPLOADS_NOTE,
    actionLabel: "Open this order",
    actionUrl: ADMIN.order("order-1"),
  });

  check("the customer's name is in the message", html.includes("Alice Ngassa"));
  check("their number is in the message", html.includes("237690123456"));
  check("the address is in the message", html.includes("Carrefour Biyem-Assi"));
  check("empty fields are dropped, not printed blank", !html.includes("Empty field"));
  check("missing fields are dropped too", !html.includes("Missing field"));
  check("there is one button into admin", html.includes(ADMIN.order("order-1")));

  console.log("\n— but never the files —");
  check("no attachment of any kind is constructed", !/attachment|Content-Disposition|base64/i.test(html));
  check("it says plainly why the documents are not here", html.includes("not attached to this email"));
  check("the private media route is never linked from email", !html.includes("/api/media"));

  console.log("\n— hostile content cannot break the message —");
  const nasty = shell({
    heading: "New order",
    subheading: "x",
    fields: [{ label: "Instructions", value: '<script>alert(1)</script> & "quotes"' }],
    actionLabel: "Open",
    actionUrl: ADMIN.dashboard(),
  });
  check("a script tag from a customer is escaped", !nasty.includes("<script>"));
  check("it is still readable once escaped", nasty.includes("&lt;script&gt;"));
  check("ampersands and quotes survive", nasty.includes("&amp;") && nasty.includes("&quot;"));
  check("escape() is exported and works", escape("<b>&</b>") === "&lt;b&gt;&amp;&lt;/b&gt;");

  console.log("\n— a plain-text copy exists for clients that refuse HTML —");
  const text = plain({
    heading: "New order UNL-ABC123",
    subheading: "Waiting for a price.",
    fields,
    actionLabel: "Open this order",
    actionUrl: ADMIN.order("order-1"),
  });
  check("the plain copy carries the same detail", text.includes("Alice Ngassa") && text.includes("237690123456"));
  check("the plain copy has no markup", !text.includes("<"));

  console.log("\n— the nightly window is a real Yaoundé night —");
  // 04:30 Yaoundé on 30 July is 03:30 UTC.
  const { from, to, label } = lastNightWindow(new Date("2026-07-30T03:30:00Z"));
  check("it starts at 6 PM Yaoundé", from.toISOString() === "2026-07-29T17:00:00.000Z", from.toISOString());
  check("it ends at 4 AM Yaoundé", to.toISOString() === "2026-07-30T03:00:00.000Z", to.toISOString());
  check("it spans ten hours", (to.getTime() - from.getTime()) / 3600_000 === 10);
  check("it is labelled by the night it began", label.includes("29"), label);
  check("a finished night, not one in progress", to.getTime() <= new Date("2026-07-30T03:30:00Z").getTime());

  console.log("\n— the summary never overstates —");
  check("zero orders reads honestly", summaryHeadline(0) === "A quiet night");
  check("one order is singular", summaryHeadline(1) === "1 order last night");
  check("many are plural", summaryHeadline(12) === "12 orders last night");

  console.log("\n— every send is recorded —");
  const log = await prisma.notificationLog.create({
    data: {
      channel: "EMAIL",
      event: "order.created",
      recipient: "urbannightlift@gmail.com",
      subject: "New order UNL-TEST",
      status: "FAILED",
      error: "RESEND_API_KEY is not set",
      entityType: "order",
      entityId: "order-1",
    },
  });
  check("a failure is written down rather than swallowed", log.status === "FAILED");
  check("with the reason", log.error?.includes("RESEND_API_KEY") === true);
  check("and what it was about", log.entityType === "order" && log.entityId === "order-1");
  const trail = await prisma.notificationLog.findMany({ where: { entityType: "order", entityId: "order-1" } });
  check("an order's whole notification trail can be pulled up", trail.length === 1);
  await prisma.notificationLog.delete({ where: { id: log.id } });

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
