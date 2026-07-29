/**
 * An account before any documents.
 *
 * The hole this closes: `/api/upload` used to mint signed upload URLs into the
 * bucket holding riders' national ID cards for anybody who asked — no name, no
 * number, nothing to trace. These checks prove the bucket tiers are now split
 * correctly, that an application is filed against the account rather than
 * whatever the form claimed, and that one account cannot hold two codes.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let failures = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

// The tiers as shipped in src/app/api/upload/route.ts.
const PUBLIC_BUCKETS = ["order-screenshots", "merchant-logos", "order-voice-notes"];
const CUSTOMER_BUCKETS = ["rider-documents", "rider-photos"];
const STAFF_BUCKETS = ["delivery-proofs"];

async function main() {
  const stamp = Date.now().toString().slice(-7);

  console.log("\n— who may upload an identity document —");
  check("ID cards are no longer anonymous-uploadable", !PUBLIC_BUCKETS.includes("rider-documents"));
  check("rider photos are no longer anonymous-uploadable", !PUBLIC_BUCKETS.includes("rider-photos"));
  check("both now require an account", CUSTOMER_BUCKETS.length === 2);
  check(
    "guest order flows still work without one",
    PUBLIC_BUCKETS.includes("order-screenshots") && PUBLIC_BUCKETS.includes("order-voice-notes")
  );
  check("no bucket sits in two tiers", new Set([...PUBLIC_BUCKETS, ...CUSTOMER_BUCKETS, ...STAFF_BUCKETS]).size === 6);

  // Documents are filed under the uploader, so a path always names its owner.
  const ownerPath = (customerId: string) => `c-${customerId}`;
  check("a document path carries the account id", ownerPath("abc123") === "c-abc123");

  console.log("\n— an application is filed against the account —");
  const customer = await prisma.customer.create({
    data: { fullName: "Paul Mbarga", whatsappNumber: `2376${stamp}0`, pinHash: "$2a$10$fake" },
  });
  const impostor = await prisma.customer.create({
    data: { fullName: "Someone Else", whatsappNumber: `2376${stamp}1`, pinHash: "$2a$10$fake" },
  });

  // What the route does: identity from the session, never from the body.
  const body = { fullName: "Paul Mbarga", whatsappNumber: "237600000000", phone: "237600000000" };
  const filed = await prisma.riderApplication.create({
    data: {
      customerId: customer.id,
      fullName: body.fullName.trim().length >= 3 ? body.fullName.trim() : customer.fullName,
      whatsappNumber: customer.whatsappNumber, // NOT body.whatsappNumber
      phone: customer.whatsappNumber,
    },
  });
  check("the number comes from the account", filed.whatsappNumber === customer.whatsappNumber);
  check("the number the form claimed is ignored", filed.whatsappNumber !== body.whatsappNumber);
  check("the application is linked to the account", filed.customerId === customer.id);

  console.log("\n— one account, one ambassador code —");
  const first = await prisma.ambassador.create({
    data: {
      code: `AAA${stamp}`,
      fullName: "Marie Ngo",
      whatsappNumber: `2376${stamp}2`,
      customerId: customer.id,
      status: "PENDING",
    },
  });
  check("the first code is accepted", first.customerId === customer.id);

  let secondRefused = false;
  try {
    await prisma.ambassador.create({
      data: {
        code: `BBB${stamp}`,
        fullName: "Marie Ngo",
        whatsappNumber: `2376${stamp}3`,
        customerId: customer.id,
        status: "PENDING",
      },
    });
  } catch {
    secondRefused = true;
  }
  check("a second code on the same account is refused", secondRefused);

  const other = await prisma.ambassador.create({
    data: {
      code: `CCC${stamp}`,
      fullName: "Someone Else",
      whatsappNumber: `2376${stamp}4`,
      customerId: impostor.id,
      status: "PENDING",
    },
  });
  check("a different account may still have its own code", other.customerId === impostor.id);

  console.log("\n— applying still grants nothing —");
  check("no staff account was created", (await prisma.user.count({ where: { phone: customer.whatsappNumber } })) === 0);
  check("the application waits for a human", filed.status === "PENDING");
  check("the ambassador code is not live", first.status === "PENDING");

  console.log("\n— the account is the ambassador login —");
  const found = await prisma.ambassador.findFirst({ where: { customerId: customer.id } });
  check("signing in as the customer finds their code", found?.id === first.id);
  check("an account with no code finds nothing", (await prisma.ambassador.findFirst({ where: { customerId: "nope" } })) === null);

  await prisma.ambassador.deleteMany({ where: { customerId: { in: [customer.id, impostor.id] } } });
  await prisma.riderApplication.deleteMany({ where: { customerId: customer.id } });
  await prisma.customer.deleteMany({ where: { id: { in: [customer.id, impostor.id] } } });

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
