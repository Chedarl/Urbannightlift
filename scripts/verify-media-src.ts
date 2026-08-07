/**
 * Proves that an image goes to the right door.
 *
 * This exists because a stored image column holds one of three different shapes
 * and two components guessed differently about which. A logo that had uploaded
 * perfectly rendered as a broken frame on the food page, and it looked for a
 * round like the upload had failed.
 *
 * What is proved here is the routing decision, because it is the only thing
 * standing between a stored path and a request:
 *
 *  - a **public** bucket becomes a public Supabase URL, so a customer's browser
 *    can fetch it with no session at all;
 *  - a **private** bucket becomes `/api/media`, which is gated to staff;
 *  - and a **prescription never becomes a public URL**, whatever it is passed
 *    through. That is the promise on the privacy page and the one check here
 *    that is about more than a broken image.
 *
 * Runs offline with no key and no database, like the other verify suites.
 *
 * Run: npx tsx scripts/verify-media-src.ts
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";

import { mediaSrc } from "../src/lib/uploads/mediaSrc";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nNothing in, nothing out");
check("null is no image", mediaSrc(null) === null);
check("undefined is no image", mediaSrc(undefined) === null);
check("empty is no image", mediaSrc("") === null);
check("whitespace is no image", mediaSrc("   ") === null);
check(
  "a bucket with no key is no image",
  mediaSrc("merchant-logos/") === null,
  "a trailing slash would otherwise build a URL to a directory"
);
check("a bare word is not a path", mediaSrc("logo.png") === null);

console.log("\nAlready finished, left alone");
check(
  "an https URL is used as it is",
  mediaSrc("https://cdn.example.com/a.png") === "https://cdn.example.com/a.png"
);
check("a protocol-relative URL survives", mediaSrc("//cdn.example.com/a.png") === "//cdn.example.com/a.png");
check("a data URI is not re-routed", mediaSrc("data:image/png;base64,AAA") === "data:image/png;base64,AAA");
check("something from our own origin is left alone", mediaSrc("/logo.png") === "/logo.png");

console.log("\nPublic buckets are fetched directly");
check(
  "a merchant logo becomes a public URL",
  mediaSrc("merchant-logos/abc/logo.png") === `${BASE}/storage/v1/object/public/merchant-logos/abc/logo.png`,
  "this is the exact case that was rendering as a broken image on the food page"
);
check(
  "a rider photo becomes a public URL",
  mediaSrc("rider-photos/xyz.jpg") === `${BASE}/storage/v1/object/public/rider-photos/xyz.jpg`,
  "a signed URL here would expire in the middle of a delivery"
);
check(
  "a public bucket never goes through the staff gate",
  !mediaSrc("merchant-logos/abc/logo.png")!.includes("/api/media"),
  "/api/media refuses this bucket with 400 and demands an admin session"
);

console.log("\nEverything else is private, and stays that way");
for (const bucket of [
  "order-screenshots",
  "delivery-proofs",
  "rider-documents",
  "order-voice-notes",
  "goods-receipts",
  "merchant-menus",
  "merchant-captures",
]) {
  const out = mediaSrc(`${bucket}/file.jpg`);
  check(
    `${bucket} goes through the gate`,
    out === `/api/media?path=${encodeURIComponent(`${bucket}/file.jpg`)}`,
    out ?? "null"
  );
}
check(
  "a bucket nobody has heard of is treated as private",
  mediaSrc("something-new/file.jpg")!.startsWith("/api/media"),
  "a new bucket must be private until somebody decides otherwise, not public by omission"
);

console.log("\nThe one that is not about a broken image");
const prescription = mediaSrc("order-screenshots/prescriptions/patient.jpg");
check(
  "a prescription never becomes a public URL",
  prescription !== null && !prescription.includes("/storage/v1/object/public/"),
  "the privacy page promises these are shown only to the staff handling that order"
);
check(
  "and it is not readable without a session",
  prescription === `/api/media?path=${encodeURIComponent("order-screenshots/prescriptions/patient.jpg")}`
);

console.log("\nWith nothing configured");
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
check(
  "a public path is no image rather than a broken one",
  mediaSrc("merchant-logos/a.png") === null,
  "a URL onto our own origin would 404 and read as a failed upload"
);
check("a private path still routes", mediaSrc("goods-receipts/a.jpg")!.startsWith("/api/media"));

console.log(
  `\n${failures === 0 ? "Public where it should be, private where it must be." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
