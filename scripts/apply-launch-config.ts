/**
 * Puts the live settings row into the launch configuration.
 *
 * `prisma/seed.ts` deliberately keeps `enabledServices`, `riderSharePercent`
 * and the rest out of its `update` block, so a reseed can never undo something
 * the owner switched on from admin Settings. That is the right default — but it
 * also means changing the seed's *create* values does nothing to a database
 * that already has the row. This script is the explicit, one-shot way to move
 * the live configuration, run from the DB-setup workflow.
 *
 * It sets:
 *  - the three launch services (food, pharmacy, small parcel)
 *  - voice-note ordering ON, so customers can talk an order instead of filling
 *    a form — the feature was built and left switched off
 *
 * It does NOT touch operating mode or test mode: opening for business and
 * ending the rehearsal are the owner's calls, made from admin Settings on the
 * night, not side effects of a deploy.
 *
 * Safe to re-run — it is a plain idempotent update.
 *
 * Run: npx tsx scripts/apply-launch-config.ts
 */
import { PrismaClient, type ServiceType } from "@prisma/client";

const prisma = new PrismaClient();

const LAUNCH_SERVICES: ServiceType[] = ["FOOD_PICKUP", "MEDICINE_PICKUP", "SMALL_PARCEL"];

async function main() {
  const before = await prisma.operatingSettings.findUnique({ where: { id: 1 } });
  if (!before) {
    console.log("No settings row yet — the seed creates it with the launch values. Nothing to do.");
    return;
  }

  console.log("Before:");
  console.log(`  services: ${before.enabledServices.join(", ") || "(none configured)"}`);
  console.log(`  voice ordering: ${before.voiceOrderingEnabled ? "on" : "off"}`);

  const after = await prisma.operatingSettings.update({
    where: { id: 1 },
    data: {
      enabledServices: LAUNCH_SERVICES,
      voiceOrderingEnabled: true,
    },
  });

  console.log("After:");
  console.log(`  services: ${after.enabledServices.join(", ")}`);
  console.log(`  voice ordering: ${after.voiceOrderingEnabled ? "on" : "off"}`);
  console.log(
    `\nMode is still ${after.mode} and test mode is ${after.testMode ? "ON" : "off"} — both left alone on purpose.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
