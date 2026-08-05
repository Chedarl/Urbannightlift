/**
 * Proves the only irreversible control in this product cannot be reached by
 * accident, or by the wrong person, or after the rehearsal is over.
 *
 * Deleting here is a **hard cascade** — a record's orders, payments, proofs and
 * history go with it, by the owner's explicit decision. Nothing is held back
 * once it starts, so everything that makes it safe has to happen *before*:
 *
 *  - **OWNER only.** Not `ADMIN_ROLES`. A dispatcher never needs this, and the
 *    smallest set of people who can destroy a record is the right set.
 *  - **Test mode only.** The switch that says "we are rehearsing" is the switch
 *    that permits it. Going live closes the door on everybody, the owner
 *    included — no separate step to remember, no flag left on by mistake.
 *  - **The name must be typed.** Not a checkbox and not "yes": the row's own
 *    name, because typing it is the only confirmation that cannot be given
 *    absently at 2 AM.
 *
 * The guard is proved rather than reviewed, because the cost of it being wrong
 * is a record nobody can get back.
 *
 * Run: npx tsx scripts/verify-hard-delete.ts
 */
import { mayHardDelete } from "../src/lib/admin/hardDelete";
import type { UserRole } from "@prisma/client";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const OWNER = { role: "OWNER" as UserRole };
const ROLES: UserRole[] = ["DISPATCHER", "SUPPORT", "RIDER"];

console.log("\nOnly the owner, and only while rehearsing");
check("the owner, in test mode, may", mayHardDelete(OWNER, true) === null);
for (const role of ROLES) {
  check(
    `a ${role.toLowerCase()} may not, even in test mode`,
    mayHardDelete({ role }, true) !== null,
    "the smallest set of people who can destroy a record is the right set"
  );
}
check("and nobody at all when signed out", mayHardDelete(null, true) === "Unauthorized");

console.log("\nGoing live closes it, for everyone");
check(
  "the owner may not once test mode is off",
  mayHardDelete(OWNER, false) !== null,
  "this is the whole safety model: launching is what removes the ability, with nothing to remember"
);
for (const role of ROLES) {
  check(`nor a ${role.toLowerCase()}`, mayHardDelete({ role }, false) !== null);
}

console.log("\nAnd the refusal says which rule stopped it");
check(
  "a wrong role is told it is about the role",
  /owner/i.test(mayHardDelete({ role: "DISPATCHER" }, true) ?? "")
);
check(
  "live mode is told it is about test mode",
  /test mode/i.test(mayHardDelete(OWNER, false) ?? ""),
  "a refusal that does not say why sends somebody hunting for a bug that is a rule"
);

console.log("\nThe typed confirmation, as the routes compare it");
// Both routes compare trimmed and case-insensitively, so a name copied from the
// screen with a trailing space still works, and "chez maman" still does not.
const matches = (typed: string, name: string) =>
  typed.trim().toLowerCase() === name.trim().toLowerCase();
check("the exact name passes", matches("Chez Maman Josephine", "Chez Maman Josephine"));
check("a copied name with a stray space passes", matches("  Chez Maman Josephine ", "Chez Maman Josephine"));
check("different case passes", matches("chez maman josephine", "Chez Maman Josephine"));
check("a near miss does not", !matches("Chez Maman", "Chez Maman Josephine"));
check("a blank does not", !matches("", "Chez Maman Josephine"));
check("and neither does 'yes'", !matches("yes", "Chez Maman Josephine"));

console.log(
  `\n${failures === 0 ? "Irreversible, and unreachable by accident." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
