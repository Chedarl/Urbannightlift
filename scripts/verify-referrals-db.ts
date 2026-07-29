/**
 * A referral, end to end, against a real database.
 *
 * Alice refers Bea. Bea orders. Bea's delivery completes. Alice's credit
 * appears, once and only once, and comes out of our share rather than the
 * rider's. Then Alice spends it.
 */
import { PrismaClient } from "@prisma/client";
import { ensureReferralCode, bindReferral, awardReferral, spendCredit, referralBalance } from "../src/lib/referrals/accrual";

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
  await prisma.operatingSettings.upsert({
    where: { id: 1 },
    update: { referralRewardPercent: 5, referralsEnabled: true, ambassadorProgrammeEnabled: false },
    create: { id: 1, enabledServices: ["FOOD_PICKUP"] },
  });
  const zone = await prisma.zone.findFirst();

  const alice = await prisma.customer.create({ data: { fullName: "Alice", whatsappNumber: `2376${stamp}1` } });
  const bea = await prisma.customer.create({ data: { fullName: "Bea", whatsappNumber: `2376${stamp}2` } });

  console.log("\n— everybody gets a code —");
  const aliceCode = await ensureReferralCode(alice.id);
  check("a code is issued", !!aliceCode && aliceCode.length === 6, String(aliceCode));
  check("asking again returns the same one", (await ensureReferralCode(alice.id)) === aliceCode);

  console.log("\n— a code binds once, and never to yourself —");
  check("Alice cannot use her own code", (await bindReferral(alice.id, aliceCode!)) === null);
  check("an unknown code does nothing", (await bindReferral(bea.id, "ZZZZZZ")) === null);
  const bound = await bindReferral(bea.id, aliceCode!);
  check("Bea is bound to Alice", bound?.referrerId === alice.id);
  check("the friend discount is zero, as the owner asked", bound?.friendDiscountXaf === 0);

  const beaCode = await ensureReferralCode(bea.id);
  check("a second code cannot rebind her", (await bindReferral(bea.id, beaCode!)) === null);

  console.log("\n— nothing is earned until the delivery completes —");
  const order = await prisma.order.create({
    data: {
      orderCode: `UNL-R${stamp.slice(-5)}`,
      customerId: bea.id,
      serviceType: "FOOD_PICKUP",
      itemDescription: "Poulet DG",
      quantity: 1,
      declaredValueXaf: 0,
      pickupLocation: "Chez Maman",
      deliveryLocation: "Biyem-Assi",
      paymentMethod: "MTN_MOMO",
      pickupZoneId: zone?.id,
      deliveryZoneId: zone?.id,
      orderStatus: "RIDER_ASSIGNED",
      paymentStatus: "VERIFIED",
      finalDeliveryFeeXaf: 1500,
      riderPayoutXaf: 900,
      isTest: false,
    },
  });
  check("an undelivered order pays nothing", (await awardReferral(order.id)) === 0);

  await prisma.order.update({ where: { id: order.id }, data: { orderStatus: "DELIVERED" } });
  const awarded = await awardReferral(order.id);
  check("delivery pays 5% of the fee", awarded === 75, String(awarded));

  console.log("\n— and never twice —");
  check("a second award is refused", (await awardReferral(order.id)) === 0);

  let bal = await referralBalance(alice.id);
  check("the balance is the ledger", bal.balanceXaf === 75, JSON.stringify(bal));
  check("it counts the friend she brought", bal.friendsBrought === 1, String(bal.friendsBrought));

  console.log("\n— the rider is untouched —");
  const after = await prisma.order.findUnique({ where: { id: order.id }, select: { riderPayoutXaf: true } });
  check("rider payout is still 900", after?.riderPayoutXaf === 900, String(after?.riderPayoutXaf));
  check("the reward fits inside our share", awarded <= 1500 - 900);

  console.log("\n— spending it —");
  const own = await prisma.order.create({
    data: {
      orderCode: `UNL-S${stamp.slice(-5)}`,
      customerId: alice.id,
      serviceType: "FOOD_PICKUP",
      itemDescription: "Her own order",
      quantity: 1,
      declaredValueXaf: 0,
      pickupLocation: "A",
      deliveryLocation: "B",
      paymentMethod: "CASH",
      pickupZoneId: zone?.id,
      deliveryZoneId: zone?.id,
      isTest: false,
    },
  });
  const spent = await spendCredit(alice.id, own.id, 1500);
  check("she spends her 75", spent === 75, String(spent));
  bal = await referralBalance(alice.id);
  check("the balance is now empty", bal.balanceXaf === 0, JSON.stringify(bal));
  check("and the ledger remembers both sides", bal.earnedXaf === 75 && bal.spentXaf === 75, JSON.stringify(bal));
  check("spending again gets nothing", (await spendCredit(alice.id, own.id, 1500)) === 0);

  console.log("\n— a test order earns nobody anything —");
  const test = await prisma.order.create({
    data: {
      orderCode: `UNL-T${stamp.slice(-5)}`,
      customerId: bea.id,
      serviceType: "FOOD_PICKUP",
      itemDescription: "Test",
      quantity: 1,
      declaredValueXaf: 0,
      pickupLocation: "A",
      deliveryLocation: "B",
      paymentMethod: "CASH",
      pickupZoneId: zone?.id,
      deliveryZoneId: zone?.id,
      orderStatus: "DELIVERED",
      finalDeliveryFeeXaf: 1500,
      riderPayoutXaf: 900,
      isTest: true,
    },
  });
  check("test order pays nothing", (await awardReferral(test.id)) === 0);

  console.log("\n— the ambassador programme is off —");
  const s = await prisma.operatingSettings.findUnique({ where: { id: 1 }, select: { ambassadorProgrammeEnabled: true } });
  check("switched off by default", s?.ambassadorProgrammeEnabled === false);

  await prisma.referralLedger.deleteMany({ where: { customerId: { in: [alice.id, bea.id] } } });
  await prisma.order.deleteMany({ where: { id: { in: [order.id, own.id, test.id] } } });
  await prisma.customer.deleteMany({ where: { id: { in: [alice.id, bea.id] } } });

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
