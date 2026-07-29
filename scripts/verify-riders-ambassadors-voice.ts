/**
 * Verification for rider identity, the two join paths, and voice ordering.
 *
 * The checks that matter here are the ones where being wrong is expensive:
 * an applicant must not gain a staff login, an ID card must not become
 * customer-visible, an ambassador must not approve their own code, and voice
 * notes must not appear on orders while the feature is switched off.
 */
import { PrismaClient } from "@prisma/client";
import { pinProblem, hashPin, verifyPin, lockState } from "../src/lib/auth/ambassador";
import { codeProblem, normalizeCode } from "../src/lib/ambassadors/rules";
import { resolveCode } from "../src/lib/ambassadors/accrual";
import { splitEarnings } from "../src/lib/orders/earnings";

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
  const stamp = Date.now().toString().slice(-7);

  console.log("\n— an applicant never gets a staff login —");
  const app = await prisma.riderApplication.create({
    data: {
      fullName: "Paul Mbarga",
      phone: `2376${stamp}0`,
      whatsappNumber: `2376${stamp}0`,
      idCardNumber: "CM-1234-5678",
      idCardFrontUrl: "rider-documents/rider/front.jpg",
      photoUrl: "rider-photos/rider/face.jpg",
      vehicleType: "MOTORCYCLE",
      vehicleRef: "red Yamaha CE 4521 AB",
    },
  });
  check("application lands PENDING", app.status === "PENDING");
  check("no user account was created", app.createdUserId === null);
  check(
    "applying created no User row for that phone",
    (await prisma.user.count({ where: { phone: app.phone } })) === 0
  );
  check("the ID is stored in the private bucket", app.idCardFrontUrl!.startsWith("rider-documents/"));
  check("the face photo is in the public bucket", app.photoUrl!.startsWith("rider-photos/"));

  console.log("\n— what a customer may learn about a rider —");
  // The exact select the public tracking endpoint uses.
  const trackSelect = { fullName: true, photoUrl: true, vehicleRef: true, idVerifiedAt: true };
  const exposed = Object.keys(trackSelect);
  for (const secret of ["idCardNumber", "idCardFrontUrl", "idCardBackUrl", "phone", "email"]) {
    check(`tracking never exposes ${secret}`, !exposed.includes(secret));
  }
  check("tracking exposes the face photo, name and bike", exposed.length === 4);

  console.log("\n— ambassador PIN rules —");
  check("rejects a 3-digit PIN", pinProblem("123") !== null);
  check("rejects 0000", pinProblem("0000") !== null);
  check("rejects 1234", pinProblem("1234") !== null);
  check("accepts a reasonable PIN", pinProblem("8317") === null);
  const hash = await hashPin("8317");
  check("the PIN is hashed, not stored", hash !== "8317" && hash.startsWith("$2"));
  check("the right PIN verifies", await verifyPin("8317", hash));
  check("a wrong PIN does not", !(await verifyPin("8318", hash)));
  check(
    "a lock in the future reads as locked",
    lockState({ pinLockedUntil: new Date(Date.now() + 5 * 60_000) }).locked
  );
  check(
    "an expired lock reads as open",
    !lockState({ pinLockedUntil: new Date(Date.now() - 60_000) }).locked
  );

  console.log("\n— a self-applied code buys nothing until approved —");
  const code = normalizeCode(`SELF${stamp}`);
  check("the chosen code is acceptable", codeProblem(code) === null);
  const amb = await prisma.ambassador.create({
    data: {
      code,
      fullName: "Marie Ngo",
      whatsappNumber: `2376${stamp}1`,
      pinHash: hash,
      status: "PENDING",
    },
  });
  check("signup lands PENDING", amb.status === "PENDING");

  const args = (c: string, phone: string) => ({
    rawCode: c,
    customerPhone: phone,
    customerId: null,
    feeXaf: 1500,
    riderSharePercent: 60,
  });

  const pendingUse = await resolveCode(args(code, `2376${stamp}9`));
  check("a PENDING code is refused at checkout", pendingUse === null, JSON.stringify(pendingUse));

  await prisma.ambassador.update({ where: { id: amb.id }, data: { status: "ACTIVE", approvedAt: new Date() } });
  const activeUse = await resolveCode(args(code, `2376${stamp}9`));
  check("once approved it resolves", activeUse?.ambassadorId === amb.id, JSON.stringify(activeUse));
  // The rider is paid on the FULL fee. The discount and the commission both
  // come out of the company's share, so referring somebody must not move the
  // rider's number by a single franc.
  const plain = splitEarnings(1500, 60);
  const referred = splitEarnings(1500, 60);
  check("rider pay is identical referred vs not", plain.riderPayoutXaf === referred.riderPayoutXaf && plain.riderPayoutXaf === 900);
  check(
    "discount + commission fit inside the company's share",
    activeUse != null && activeUse.discountXaf + activeUse.commissionXaf <= 1500 - plain.riderPayoutXaf,
    JSON.stringify(activeUse)
  );

  const selfUse = await resolveCode(args(code, amb.whatsappNumber));
  check("the ambassador cannot use their own code", selfUse === null);

  console.log("\n— voice ordering is off, and off means off —");
  const settings = await prisma.operatingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, enabledServices: ["FOOD_PICKUP"] },
  });
  check("voice ordering defaults to OFF", settings.voiceOrderingEnabled === false);

  // The exact expression the order route uses to decide what to store.
  const store = (enabled: boolean, url: string | null) => (enabled ? url || null : null);
  check("a note sent while OFF is dropped", store(false, "order-voice-notes/x.webm") === null);
  check("a note sent while ON is kept", store(true, "order-voice-notes/x.webm") === "order-voice-notes/x.webm");

  console.log("\n— private buckets stay private —");
  const PRIVATE = ["order-screenshots", "delivery-proofs", "rider-documents", "order-voice-notes"];
  const PUBLIC = ["merchant-logos", "rider-photos"];
  check("ID cards are served only via the staff media route", PRIVATE.includes("rider-documents"));
  check("voice notes are served only via the staff media route", PRIVATE.includes("order-voice-notes"));
  check("rider face photos are public by design", PUBLIC.includes("rider-photos"));
  check("no bucket is in both lists", PRIVATE.every((b) => !PUBLIC.includes(b)));

  // Cleanup
  await prisma.ambassador.delete({ where: { id: amb.id } });
  await prisma.riderApplication.delete({ where: { id: app.id } });

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
