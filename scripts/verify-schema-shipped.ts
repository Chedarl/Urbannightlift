/**
 * Proves every column the code selects has a migration that creates it.
 *
 * ## The outage
 *
 * The build command was `prisma generate && next build`. `generate` writes a
 * client that knows every column in `schema.prisma`; `next build` compiles code
 * that selects them. **Nothing applied the migration.**
 *
 * A deploy adding eight columns to `OperatingSettings` therefore shipped a
 * client asking Postgres for columns Postgres had never heard of. The home
 * page, the order form, `/api/settings` and `/api/food/browse` all returned
 * 500 — every page that reads operating settings, which is most of them.
 *
 * The Vercel deployment was green. The GitHub checks were green. All 58 suites
 * passed, because they ran against a local database that *had* been migrated.
 * Every signal a person looks at said fine while the site was down.
 *
 * ## What this checks, and why it is the schema rather than the database
 *
 * The build now runs `prisma migrate deploy` first, which is the actual fix.
 * This is the check that would have caught it *before* the deploy: the schema
 * and the migrations have to agree.
 *
 * It reads files rather than connecting, deliberately — the failure it guards
 * against is precisely a machine whose database is fine (mine was) while
 * production's is not. A check that connects to a migrated database proves
 * nothing about the one being deployed to.
 *
 * Run: npx tsx scripts/verify-schema-shipped.ts
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");

const migrationsDir = path.join(ROOT, "prisma/migrations");
const migrations = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => fs.readFileSync(path.join(migrationsDir, e.name, "migration.sql"), "utf8"))
  .join("\n");

console.log("The build applies migrations before it ships code that needs them");
{
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const build: string = pkg.scripts?.build ?? "";

  check(
    "the build runs a predeploy step",
    build.includes("predeploy"),
    `build is "${build}" — generate + build alone ships a client for a schema the database does not have`
  );
  /*
    Tracked by git, not merely present on this disk.

    The first version of this asked `fs.existsSync`. It passed, while
    `.gitignore` line 48 — a blanket `*.mjs` for throwaway scripts — silently
    excluded `scripts/predeploy.mjs` from the commit. The build command referred
    to a file that would not exist in the repository, so every Vercel build
    would have failed with "Cannot find module".

    Which is the same mistake as the outage this file is about: checking the
    machine I am on instead of the thing that ships. Twice in one sitting.
  */
  const tracked = execSync("git ls-files scripts/predeploy.mjs", { cwd: ROOT, encoding: "utf8" }).trim();
  check(
    "the predeploy script is committed, not just present locally",
    tracked === "scripts/predeploy.mjs",
    tracked
      ? `git reports "${tracked}"`
      : "git does not track it — `git check-ignore -v scripts/predeploy.mjs` will say which rule excludes it. " +
        "The build references this file; without it every deploy fails."
  );

  const predeploy = fs.existsSync(path.join(ROOT, "scripts/predeploy.mjs"))
    ? fs.readFileSync(path.join(ROOT, "scripts/predeploy.mjs"), "utf8")
    : "";
  check("it applies pending migrations", /migrate deploy/.test(predeploy));
  check(
    "only on production builds",
    /VERCEL_ENV/.test(predeploy),
    "previews share the production database; migrating from a preview changes the live schema before anything is merged"
  );
  check(
    "and a failed migration stops the build",
    /process\.exit\(1\)/.test(predeploy),
    "deploying anyway is the outage: a green light over a 500"
  );
}

console.log("\nEvery model field has a migration that creates its column");
{
  /*
    Parsed rather than queried. The failure guarded against is a machine whose
    database is fine while production's is not — and mine was fine, which is
    exactly why every suite passed while the site was down.
  */
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
  check("the schema has models to check", models.length > 10, `found ${models.length}`);

  const SCALARS = /^(String|Int|Float|Boolean|DateTime|Json|Decimal|BigInt|Bytes)\b/;
  let checked = 0;
  const missing: string[] = [];

  for (const [, model, body] of models) {
    for (const line of body.split("\n")) {
      const m = line.trim().match(/^(\w+)\s+(\S+)/);
      if (!m) continue;
      const [, field, type] = m;
      // Relations and enums live in their own statements; only scalar columns
      // are created by an ALTER/CREATE naming them.
      if (!SCALARS.test(type)) continue;
      if (/@relation|@@/.test(line)) continue;

      checked++;
      // The column name appears quoted in any migration that creates it,
      // whether by CREATE TABLE or ALTER TABLE ... ADD COLUMN.
      if (!migrations.includes(`"${field}"`)) missing.push(`${model}.${field}`);
    }
  }

  check("there are fields to check", checked > 100, `only ${checked}`);
  check(
    "no field is missing from every migration",
    missing.length === 0,
    `${missing.length} field(s) exist in schema.prisma with no migration creating them:\n       ` +
      `${missing.slice(0, 10).join("\n       ")}\n       ` +
      `A deploy would ship a client selecting these and 500 on every read.`
  );
}

console.log("\nAnd the fare columns specifically — the ones that took the site down");
{
  for (const col of [
    "fareMinimumXaf", "fareIncludedKm", "farePerKmXaf", "fareErrandXaf",
    "fareLateNightPercent", "fareLateNightFromHour", "fareYellowPercent", "fareRedPercent",
  ]) {
    check(`${col} has a migration`, migrations.includes(`"${col}"`));
  }
}

console.log(
  `\n${failures === 0 ? "The database will have every column this build expects." : `${failures} check(s) FAILED — a deploy could ship code the database cannot serve.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
