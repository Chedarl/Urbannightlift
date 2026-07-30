/**
 * Proves the help panel shows the right page's guide.
 *
 * Route matching is the kind of thing that looks obviously correct and then
 * quietly hands a dispatcher the order *list's* help while they are staring at
 * a single order. Half-right help is worse than none, so it is checked.
 *
 * Run: npx tsx scripts/verify-guides.ts
 */
import { GUIDES, guideForPath } from "../src/lib/help/guides";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok ? "" : `\n       expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const titleAt = (path: string) => guideForPath(path)?.title.en ?? null;

console.log("\nExact routes");
check("the board", titleAt("/admin/dashboard"), "Tonight's board");
check("settings", titleAt("/admin/settings"), "Settings");
check("rider tonight", titleAt("/rider/dashboard"), "Tonight");

console.log("\nDynamic routes resolve to their own guide, not the list's");
check("one order", titleAt("/admin/orders/cmabc123"), "One order");
check("the list is still the list", titleAt("/admin/orders"), "All orders");
check("a rider's job", titleAt("/rider/orders/cmxyz789"), "The job");

console.log("\nA page with no guide of its own falls back to its section");
check("a customer record falls back to Customers", titleAt("/admin/customers/cm123"), "Customers");
check("and never to a different section",
  titleAt("/admin/customers/cm123") === titleAt("/admin/orders"), false);

console.log("\nWhere there should be no help at all");
check("the customer portal is excluded on purpose", guideForPath("/account"), null);
check("the public home", guideForPath("/"), null);
check("an unknown admin page gets nothing rather than something wrong",
  guideForPath("/admin/nonexistent"), null);

console.log("\nEvery guide is complete and bilingual");
for (const [path, g] of Object.entries(GUIDES)) {
  const complete =
    g.title.en.length > 0 && g.title.fr.length > 0 &&
    g.purpose.en.length > 0 && g.purpose.fr.length > 0 &&
    g.steps.length > 0 &&
    g.steps.every((s) => s.en.length > 0 && s.fr.length > 0) &&
    (!g.watchOut || (g.watchOut.en.length > 0 && g.watchOut.fr.length > 0));
  check(path, complete, true);
}

console.log("\nCoverage");
// If a staff route exists without a guide, the icon silently disappears there —
// which reads as a bug rather than as a deliberate omission.
const STAFF_ROUTES = [
  "/admin/dashboard", "/admin/orders", "/admin/orders/[orderId]", "/admin/live",
  "/admin/customers", "/admin/earnings", "/admin/zones", "/admin/merchants",
  "/admin/ambassadors", "/admin/riders/applications", "/admin/complaints",
  "/admin/support", "/admin/users", "/admin/settings",
  "/rider/dashboard", "/rider/earnings", "/rider/orders/[orderId]", "/rider/profile",
];
for (const r of STAFF_ROUTES) check(r, Boolean(GUIDES[r]), true);

console.log(`\n${failures === 0 ? "Every staff screen explains itself, in both languages." : `${failures} check(s) FAILED.`}\n`);
process.exit(failures === 0 ? 0 : 1);
