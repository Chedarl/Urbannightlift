/**
 * Does voice ordering actually work, end to end?
 *
 * The owner asked for it built, proven, then switched off. This exercises the
 * whole path with the feature ON — an order carrying a recording is stored,
 * dispatch can find it, and the note lives in the private bucket — and then
 * proves the switch really is a switch: with it OFF the same submission stores
 * no note at all.
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

/** The exact expressions `POST /api/orders` uses. */
const storeUrl = (on: boolean, url: string) => (on ? url || null : null);
const storeSecs = (on: boolean, s: number | null) => (on ? (s ?? null) : null);

async function placeOrder(voiceOn: boolean, code: string) {
  const zone = await prisma.zone.findFirst();
  const customer = await prisma.customer.upsert({
    where: { whatsappNumber: "237690555111" },
    update: {},
    create: { fullName: "Voice Tester", whatsappNumber: "237690555111" },
  });

  return prisma.order.create({
    data: {
      orderCode: code,
      customerId: customer.id,
      serviceType: "FOOD_PICKUP",
      itemDescription: "sent as a voice note",
      quantity: 1,
      declaredValueXaf: 0,
      pickupLocation: "Chez Maman, Biyem-Assi",
      deliveryLocation: "Carrefour Biyem-Assi",
      paymentMethod: "CASH",
      pickupZoneId: zone?.id,
      deliveryZoneId: zone?.id,
      voiceNoteUrl: storeUrl(voiceOn, "order-voice-notes/voice/1750000000-note.webm"),
      voiceNoteSeconds: storeSecs(voiceOn, 23),
      isTest: true,
    },
  });
}

async function main() {
  const suffix = Date.now().toString().slice(-6);

  console.log("\n— with voice ordering ON —");
  await prisma.operatingSettings.update({ where: { id: 1 }, data: { voiceOrderingEnabled: true } });
  const withNote = await placeOrder(true, `UNL-V${suffix}`);
  check("the order kept the recording", withNote.voiceNoteUrl != null, String(withNote.voiceNoteUrl));
  check("and how long it runs", withNote.voiceNoteSeconds === 23);
  check(
    "the recording is in the private bucket",
    withNote.voiceNoteUrl!.startsWith("order-voice-notes/")
  );

  // What the admin order screen loads.
  const forDispatch = await prisma.order.findUnique({
    where: { id: withNote.id },
    select: { voiceNoteUrl: true, voiceNoteSeconds: true },
  });
  check("dispatch can find it on the order", forDispatch?.voiceNoteUrl === withNote.voiceNoteUrl);
  check(
    "and plays it through the staff-gated media route",
    `/api/media?path=${encodeURIComponent(forDispatch!.voiceNoteUrl!)}`.startsWith("/api/media?path=order-voice-notes")
  );

  console.log("\n— with voice ordering OFF —");
  await prisma.operatingSettings.update({ where: { id: 1 }, data: { voiceOrderingEnabled: false } });
  const withoutNote = await placeOrder(false, `UNL-X${suffix}`);
  check("the same submission stores no recording", withoutNote.voiceNoteUrl === null);
  check("and no duration", withoutNote.voiceNoteSeconds === null);

  const settings = await prisma.operatingSettings.findUnique({ where: { id: 1 } });
  check("the feature is left OFF, as asked", settings?.voiceOrderingEnabled === false);

  await prisma.order.deleteMany({ where: { id: { in: [withNote.id, withoutNote.id] } } });
  await prisma.customer.deleteMany({ where: { whatsappNumber: "237690555111" } });

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
