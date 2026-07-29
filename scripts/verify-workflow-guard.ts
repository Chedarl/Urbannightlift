/**
 * The order of work, enforced against a real database.
 *
 * `verify-workflow.ts` proves the stage machine. This proves the guard the API
 * routes actually call: that a step which is locked or already finished is
 * refused at the server, not merely hidden on screen. A hidden button is not a
 * closed door — a stale tab, a double tap or two dispatchers on the same order
 * all get past the UI.
 */
import { PrismaClient } from "@prisma/client";
import { loadWorkflow, guardStep } from "../src/lib/orders/workflowGuard";

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
  const stamp = Date.now().toString().slice(-8);
  const zone = await prisma.zone.findFirst();
  const customer = await prisma.customer.create({
    data: { fullName: "Workflow Tester", whatsappNumber: `2376${stamp}` },
  });

  const order = await prisma.order.create({
    data: {
      orderCode: `UNL-W${stamp.slice(-5)}`,
      customerId: customer.id,
      serviceType: "FOOD_PICKUP",
      itemDescription: "1× Poulet DG",
      quantity: 1,
      declaredValueXaf: 0,
      pickupLocation: "Chez Maman",
      deliveryLocation: "Carrefour Biyem-Assi",
      paymentMethod: "MTN_MOMO",
      pickupZoneId: zone?.id,
      deliveryZoneId: zone?.id,
      orderStatus: "AWAITING_DISPATCHER_REVIEW",
      isTest: true,
    },
  });

  console.log("\n— a brand new order —");
  let steps = await loadWorkflow(order.id);
  check("the workflow loads", steps != null && steps.length === 6, String(steps?.length));
  check("review is the live step", steps?.find((s) => s.state === "ACTIVE")?.key === "REVIEW");
  check("pricing is refused", (await guardStep(order.id, "QUOTE")) === "Approve the order first.");
  check("verifying money is refused", (await guardStep(order.id, "PAYMENT")) != null);
  check("dispatching is refused", (await guardStep(order.id, "DISPATCH")) != null);

  console.log("\n— approved —");
  await prisma.order.update({
    where: { id: order.id },
    data: { orderStatus: "APPROVED", approvedAt: new Date() },
  });
  check("pricing is now allowed", (await guardStep(order.id, "QUOTE")) === null);
  check("approving again is refused", /already finished/.test((await guardStep(order.id, "REVIEW")) ?? ""));
  check("money is still refused", (await guardStep(order.id, "PAYMENT")) != null);
  check(
    "and it says why",
    (await guardStep(order.id, "PAYMENT")) === "The customer has not accepted the price yet.",
    String(await guardStep(order.id, "PAYMENT"))
  );

  console.log("\n— priced, but not yet accepted —");
  await prisma.order.update({
    where: { id: order.id },
    data: { quoteSentAt: new Date(), quotedFeeXaf: 1500 },
  });
  check("money still refused while the price is unanswered", (await guardStep(order.id, "PAYMENT")) != null);
  check("dispatch still refused", (await guardStep(order.id, "DISPATCH")) != null);

  console.log("\n— customer accepted —");
  await prisma.order.update({ where: { id: order.id }, data: { quoteAcceptedAt: new Date() } });
  check("money may now be verified", (await guardStep(order.id, "PAYMENT")) === null);
  check("re-pricing is now refused", (await guardStep(order.id, "QUOTE")) != null);
  check(
    "dispatch refused, and says the money is why",
    (await guardStep(order.id, "DISPATCH")) === "The payment has not been verified.",
    String(await guardStep(order.id, "DISPATCH"))
  );

  console.log("\n— money verified —");
  const staff = await prisma.user.findFirst({ where: { role: { in: ["OWNER", "DISPATCHER"] } } });
  await prisma.payment.create({
    data: {
      orderId: order.id,
      customerId: customer.id,
      amountXaf: 1500,
      paymentMethod: "MTN_MOMO",
      status: "VERIFIED",
      verifiedAt: new Date(),
      verifiedById: staff?.id ?? null,
    },
  });
  await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "VERIFIED" } });

  check("a rider may now be sent", (await guardStep(order.id, "DISPATCH")) === null);
  check("verifying again is refused", /already finished/.test((await guardStep(order.id, "PAYMENT")) ?? ""));

  steps = await loadWorkflow(order.id);
  const paymentStep = steps?.find((s) => s.key === "PAYMENT");
  check("the payment step carries its evidence", paymentStep?.proof?.startsWith("Verified") === true, String(paymentStep?.proof));
  if (staff) {
    check("including who verified it", paymentStep?.proof?.includes(staff.fullName) === true, String(paymentStep?.proof));
  }

  console.log("\n— rider accepted —");
  const rider = await prisma.user.findFirst({ where: { role: "RIDER" } });
  if (rider) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        orderStatus: "RIDER_ASSIGNED",
        assignedRiderId: rider.id,
        assignedAt: new Date(),
        riderAcceptedAt: new Date(),
        otpCode: "1622",
      },
    });
    check("re-assigning is refused", (await guardStep(order.id, "DISPATCH")) != null);
    steps = await loadWorkflow(order.id);
    const dispatchStep = steps?.find((s) => s.key === "DISPATCH");
    check("the rider and code are recorded", dispatchStep?.proof?.includes("delivery code issued") === true, String(dispatchStep?.proof));
    check("proof of delivery is the live step", steps?.find((s) => s.state === "ACTIVE")?.key === "PROOF");
  }

  console.log("\n— an order that does not exist —");
  check("is refused rather than crashing", (await guardStep("nope", "QUOTE")) === "That order no longer exists.");

  await prisma.payment.deleteMany({ where: { orderId: order.id } });
  await prisma.order.delete({ where: { id: order.id } });
  await prisma.customer.delete({ where: { id: customer.id } });

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
