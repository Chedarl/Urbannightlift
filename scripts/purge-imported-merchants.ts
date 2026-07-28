/**
 * Remove the merchants imported from OpenStreetMap.
 *
 * The import looked reasonable and was wrong. The owner checked it against the
 * city: most of those businesses no longer trade at those addresses, and the
 * pharmacies were worse. A catalogue that is mostly defunct is not a head start
 * — it buries the real merchants, makes the verification queue unworkable, and
 * would eventually put a rider in front of a closed door. Better to hold a
 * short list that is true.
 *
 * Two things this is careful about:
 *
 *  - **Nothing a customer has used is deleted.** A merchant attached to any
 *    order stays, whatever its source, so order history never loses the name of
 *    the place the food came from. Those rows are deactivated instead.
 *  - **The one useful signal is kept.** A Cameroonian mobile number that still
 *    answers is real evidence a business is alive — better evidence than any
 *    social post, and free to check over WhatsApp. Those numbers are written out
 *    as a call list before the rows go.
 *
 *   npx tsx scripts/purge-imported-merchants.ts --dry-run
 *   npx tsx scripts/purge-imported-merchants.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CALL_LIST = join(process.cwd(), "prisma", "data", "imported-mobile-numbers.csv");

/** MTN/Orange/Camtel mobiles start with 6; 2xx is a landline, usually dead. */
function isCameroonMobile(raw: string | null): boolean {
  if (!raw) return false;
  const digits = raw.replace(/\D/g, "").replace(/^237/, "");
  return digits.length >= 9 && digits.startsWith("6");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const imported = await prisma.merchant.findMany({
    where: { source: "osm" },
    select: {
      id: true,
      merchantName: true,
      category: true,
      neighbourhood: true,
      address: true,
      phone: true,
      whatsappNumber: true,
      latitude: true,
      longitude: true,
      _count: { select: { orders: true } },
    },
  });

  if (imported.length === 0) {
    console.log("Nothing imported from the map is left. Nothing to do.");
    return;
  }

  const used = imported.filter((m) => m._count.orders > 0);
  const removable = imported.filter((m) => m._count.orders === 0);

  // The call list is the only part of this data worth keeping: a number that
  // answers on WhatsApp proves the business exists today.
  const callable = removable.filter((m) => isCameroonMobile(m.phone ?? m.whatsappNumber));
  const csv = [
    "name,category,neighbourhood,phone,latitude,longitude",
    ...callable.map((m) =>
      [
        m.merchantName,
        m.category,
        m.neighbourhood ?? "",
        (m.phone ?? m.whatsappNumber ?? "").trim(),
        m.latitude ?? "",
        m.longitude ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");

  console.log(`Imported from the map: ${imported.length}`);
  console.log(`  attached to an order (kept, deactivated): ${used.length}`);
  console.log(`  to delete: ${removable.length}`);
  console.log(`  of those, with a reachable mobile number: ${callable.length}`);

  if (dryRun) {
    console.log("\nDry run — nothing was changed.");
    return;
  }

  // prisma/data holds no source files any more, so it may not exist.
  mkdirSync(join(process.cwd(), "prisma", "data"), { recursive: true });
  writeFileSync(CALL_LIST, csv);
  console.log(`\nCall list written to ${CALL_LIST}`);

  // Products and pharmacy duty rows cascade with the merchant.
  const { count } = await prisma.merchant.deleteMany({
    where: { id: { in: removable.map((m) => m.id) } },
  });

  if (used.length > 0) {
    await prisma.merchant.updateMany({
      where: { id: { in: used.map((m) => m.id) } },
      data: { active: false, verified: false, acceptingOrders: false, source: "retired_import" },
    });
  }

  const remaining = await prisma.merchant.count();
  console.log(`Deleted ${count}. ${used.length} kept for order history but switched off.`);
  console.log(`${remaining} merchants remain — the ones a person actually stood behind.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
