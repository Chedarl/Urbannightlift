/**
 * Proves the database is not reachable around the application.
 *
 * ## The hole this was written after
 *
 * Every previous security round in this project audited the **application** —
 * all 107 API routes, their auth gates, their role checks — and found them
 * correct. They were correct. And the whole database was readable and writable
 * anyway, by anybody, through a door the application does not control.
 *
 * Supabase exposes the `public` schema over PostgREST using the **anon key**,
 * which ships in the browser bundle of every page. With RLS off and the default
 * grants in place, that is a complete second API onto the same tables. Probed
 * against production before it was closed:
 *
 * ```
 * GET   /rest/v1/Customer            200  fullName, whatsappNumber, pinHash
 * GET   /rest/v1/User                200  idCardNumber, idCardFrontUrl, role
 * GET   /rest/v1/Order               200  (otpCode is a column on it)
 * POST  /rest/v1/ServiceInterest     400  NOT NULL — i.e. permission granted
 * PATCH /rest/v1/User {"role":"OWNER"} 204
 * ```
 *
 * The lesson is not "enable RLS". It is that **auditing the front door proves
 * nothing about the building.** So this suite asserts the property from the
 * outside: not "is the setting on" but "can a stranger with the public key read
 * anything".
 *
 * ## Why this one talks to the network
 *
 * Every other suite here is pure and offline on principle. This one cannot be:
 * the thing being proved is what a real HTTP request to a real host returns,
 * and a local reimplementation of PostgREST's permission model would prove only
 * that I can write the same bug twice. It skips cleanly when the keys are
 * absent, so it never fails a build for being offline.
 *
 * Run: npx tsx scripts/verify-db-exposure.ts
 */

// This file uses only global `fetch`, so without an import or export
// TypeScript treats it as a script rather than a module — and its top-level
// `failures` then collides with every other suite's. One export makes it a
// module and keeps its scope its own.
export {};

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://mivskfiyjhrzszywbcav.supabase.co";
const KEYS = [
  ["legacy anon", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ""],
  ["publishable", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""],
].filter(([, k]) => k.length > 0) as [string, string][];

/** The tables where a leak is not an inconvenience but a harm. */
const SENSITIVE = [
  ["Customer", "names, WhatsApp numbers and PIN hashes"],
  ["User", "staff and rider ID card numbers and document URLs"],
  ["Order", "delivery OTPs, addresses and customer contact"],
  ["Payment", "what everybody paid and how"],
  ["RiderApplication", "applicants' identity documents"],
  ["AssistantTurn", "private conversations we promised to keep for 30 days"],
];

async function main() {
  if (KEYS.length === 0) {
    console.log(
      "\n  skipped — no publishable Supabase key in the environment.\n" +
        "  This suite proves what a stranger can reach, so it needs the key a\n" +
        "  stranger would have. Set NEXT_PUBLIC_SUPABASE_ANON_KEY to run it.\n"
    );
    process.exit(0);
  }

  for (const [label, key] of KEYS) {
    console.log(`\nNothing is readable with the ${label} key`);

    for (const [table, what] of SENSITIVE) {
      let status = 0;
      try {
        const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*&limit=1`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(20_000),
        });
        status = res.status;
      } catch {
        // A network failure is not a pass. Say so rather than counting it green.
        check(`${table} could be probed at all`, false, "the request did not complete — this check proved nothing");
        continue;
      }

      check(
        `${table} refuses the public key`,
        status === 401 || status === 403 || status === 404,
        `HTTP ${status} — this returns ${what} to anyone who opens the page source`
      );
    }

    console.log(`\nAnd nothing is writable with the ${label} key`);
    for (const [method, table, body] of [
      ["POST", "ServiceInterest", "{}"],
      ["PATCH", "User", '{"role":"OWNER"}'],
    ] as [string, string, string][]) {
      let status = 0;
      try {
        const qs = method === "PATCH" ? "?id=eq.__verify_no_such_id__" : "";
        const res = await fetch(`${URL_BASE}/rest/v1/${table}${qs}`, {
          method,
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body,
          signal: AbortSignal.timeout(20_000),
        });
        status = res.status;
      } catch {
        check(`${method} ${table} could be probed`, false, "the request did not complete");
        continue;
      }

      check(
        `${method} ${table} is refused`,
        status === 401 || status === 403 || status === 404,
        `HTTP ${status} — anything other than a refusal means a stranger can write to this table. ` +
          `A 400 is NOT safe here: it means the permission check passed and a constraint stopped it.`
      );
    }
  }

  console.log(
    `\n${failures === 0 ? "The only way into this data is through the application." : `${failures} check(s) FAILED — the database is reachable around the app.`}\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
