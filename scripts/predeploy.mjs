/**
 * Brings the database up to the schema the build is about to ship.
 *
 * ## The outage this exists to prevent
 *
 * The build command was `prisma generate && next build`. `generate` writes a
 * client that knows about every column in `schema.prisma`; `next build`
 * compiles code that selects them. **Nothing applied the migration.**
 *
 * So a deploy that added eight columns shipped a client asking Postgres for
 * columns Postgres had never heard of, and every page that reads
 * `OperatingSettings` — the home page, the order form, `/api/settings`,
 * `/api/food/browse` — returned 500. The Vercel deployment was green. The
 * GitHub checks were green. The site was down.
 *
 * That is the worst shape a failure can take here: every signal a person looks
 * at said fine.
 *
 * ## Why it is conditional
 *
 * Preview builds share the production database — there is no branch database in
 * this project. If previews ran migrations, opening a pull request would change
 * the live schema before anybody merged it, and closing that pull request
 * without merging would leave production carrying columns no deployed code
 * knows about. So migrations run on production builds only, and a preview is
 * told plainly that it is checking code against a schema it did not apply.
 *
 * ## Why a failure here fails the build
 *
 * A migration that cannot be applied must stop the deploy. Shipping the code
 * anyway is precisely the outage above: the alternative to a failed build is a
 * successful deploy of a broken site.
 */

import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV ?? "local";

if (env !== "production") {
  console.log(`predeploy: ${env} build — migrations not applied (previews share the production database)`);
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  // Better a loud stop than a deploy whose schema silently drifted.
  console.error("predeploy: DATABASE_URL is not set on a production build — refusing to deploy code whose schema cannot be applied.");
  process.exit(1);
}

console.log("predeploy: applying pending migrations before the build");
try {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  console.log("predeploy: database is at the schema this build expects");
} catch {
  console.error(
    "\npredeploy: a migration could not be applied, so this build is stopped.\n" +
      "Deploying anyway would ship code that selects columns the database does not have,\n" +
      "which returns 500 on every page that reads them while every status light stays green.\n"
  );
  process.exit(1);
}
