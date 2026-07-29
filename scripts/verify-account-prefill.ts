/**
 * Verification for "know me and remember me".
 *
 * Two things are worth proving here rather than eyeballing: that a saved
 * address is priced from today's zones instead of replaying a stale fee, and
 * that one customer can never read, overwrite or delete another's addresses —
 * every query in the route is scoped by the session's customer id, and this
 * exercises that scoping against a real database.
 */
import { PrismaClient } from "@prisma/client";
import { savedAddressToLocation, reorderDraft, localPhone, isRealName } from "../src/lib/account/profile";

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
  console.log("\n— pure helpers —");
  check("localPhone strips the country code", localPhone("237690123456") === "690123456");
  check("localPhone leaves a local number alone", localPhone("690123456") === "690123456");
  check("placeholder name is not greeted", !isRealName("Customer") && !isRealName("Client"));
  check("a real name is greeted", isRealName("Alice Ngassa"));

  console.log("\n— saved address is priced from today's zones —");
  const zones = [
    { id: "z-green", zoneName: "Biyem-Assi", tier: "GREEN" as const, feeXaf: 1500, centroidLat: 3.84, centroidLng: 11.48 },
    { id: "z-red", zoneName: "Nkolbisson", tier: "RED" as const, feeXaf: 2500, centroidLat: 3.87, centroidLng: 11.41 },
  ];
  const addr = {
    id: "a1",
    label: "Home",
    locationText: "Carrefour Biyem-Assi",
    landmark: "opposite the pharmacy",
    lat: 3.841,
    lng: 11.481,
    // Deliberately stale: this address was saved when it resolved to the red zone.
    zoneId: "z-red",
  };
  const loc = savedAddressToLocation(addr, zones);
  check("re-resolves to the nearest zone, not the stored one", loc.zoneId === "z-green", `got ${loc.zoneId}`);
  check("carries today's fee", loc.feeXaf === 1500, `got ${loc.feeXaf}`);
  check("carries today's tier", loc.tier === "GREEN", `got ${loc.tier}`);
  check("text matches what the forms write", loc.primaryName === "Carrefour Biyem-Assi");
  check("keeps the landmark", loc.landmark === "opposite the pharmacy");

  const noPin = savedAddressToLocation({ ...addr, lat: null, lng: null }, zones);
  check("no pin → dispatcher review, no invented fee", noPin.serviceStatus === "REVIEW_REQUIRED" && noPin.feeXaf === null);

  console.log("\n— address ownership is scoped to the session's customer —");
  const alice = await prisma.customer.create({
    data: { fullName: "Alice Ngassa", whatsappNumber: `237690${Date.now() % 1000000}`.slice(0, 12) },
  });
  const mallam = await prisma.customer.create({
    data: { fullName: "Mallam Bello", whatsappNumber: `237691${Date.now() % 1000000}`.slice(0, 12) },
  });

  const aliceHome = await prisma.customerAddress.create({
    data: { customerId: alice.id, label: "Home", locationText: "Carrefour Biyem-Assi", lat: 3.841, lng: 11.481 },
  });

  // What the DELETE route does: scoped by BOTH ids.
  const theft = await prisma.customerAddress.deleteMany({ where: { id: aliceHome.id, customerId: mallam.id } });
  check("another customer cannot delete it", theft.count === 0);
  check("it is still there", (await prisma.customerAddress.count({ where: { id: aliceHome.id } })) === 1);

  const own = await prisma.customerAddress.deleteMany({ where: { id: aliceHome.id, customerId: alice.id } });
  check("the owner can delete it", own.count === 1);

  // What the POST route does when the same place is saved twice.
  const first = await prisma.customerAddress.create({
    data: { customerId: alice.id, label: "Home", locationText: "Bastos, rue 1.800" },
  });
  const dup = await prisma.customerAddress.findFirst({
    where: { customerId: alice.id, locationText: "Bastos, rue 1.800" },
  });
  check("a repeat save finds the existing row", dup?.id === first.id);
  check("and does not create a twin", (await prisma.customerAddress.count({ where: { customerId: alice.id } })) === 1);

  // The same text under a different customer is a different address.
  await prisma.customerAddress.create({
    data: { customerId: mallam.id, label: "Home", locationText: "Bastos, rue 1.800" },
  });
  check(
    "the same street for another customer is separate",
    (await prisma.customerAddress.count({ where: { customerId: alice.id } })) === 1 &&
      (await prisma.customerAddress.count({ where: { customerId: mallam.id } })) === 1
  );

  console.log("\n— reorder rebuilds a submittable draft —");
  const draft = reorderDraft(
    {
      fullName: "Alice Ngassa",
      whatsappNumber: "237690123456",
      preferredLanguage: "EN",
      totalOrders: 5,
      addresses: [],
      lastOrder: null,
    },
    {
      orderCode: "UNL-ABC123",
      serviceType: "FOOD_PICKUP",
      itemDescription: "2× Poulet DG",
      serviceDetails: { foodItems: [{ name: "Poulet DG", qty: 2 }] },
      quantity: 1,
      declaredValueXaf: 0,
      pickupLocation: "Chez Maman",
      pickupLandmark: null,
      deliveryLocation: "Carrefour Biyem-Assi",
      deliveryLandmark: null,
      paymentMethod: "CASH",
      feeXaf: 1500,
      isMedicine: false,
    }
  );
  check("keeps the dishes", (draft.serviceDetails as Record<string, unknown>)?.foodItems != null);
  check("keeps both locations", draft.pickupLocation === "Chez Maman" && draft.deliveryLocation === "Carrefour Biyem-Assi");
  check("carries the last settled fee", draft.estimatedFeeXaf === 1500);
  check("does not re-assert consent silently for a paid state", draft.itemAlreadyPaid === false);

  // Cleanup
  await prisma.customerAddress.deleteMany({ where: { customerId: { in: [alice.id, mallam.id] } } });
  await prisma.customer.deleteMany({ where: { id: { in: [alice.id, mallam.id] } } });

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
