/**
 * Runs every proof in this directory and says honestly what happened.
 *
 * ## Why a runner exists at all
 *
 * There are 53 suites in `scripts/` and, until now, **nothing ran them**. No
 * workflow, no npm script, no pre-commit. They ran when somebody remembered to
 * run them, one at a time, which for a body of tests this size means they ran
 * when somebody already suspected a problem — the moment they are least useful.
 *
 * Two bugs shipped this month that a green suite would not have caught anyway
 * (the food artwork rendered nothing; every receipt printed `125/000 XAF`), and
 * both are fixed. But the reason neither was *noticed* for months is the same
 * reason the watchman went unrun for a month: nothing was looking, and nothing
 * said that nothing was looking.
 *
 * ## The two things that make a bare `for` loop lie
 *
 * **1. `server-only`.** 22 of the 53 suites import modules that pull in
 * `server-only`, a package whose entire job is to throw when imported outside a
 * React Server Component. `tsx` is not one, so those suites abort on import —
 * *before running a single check*. A naive loop reports 22 failures and the app
 * looks like it is falling apart. It is not; they never started. This stubs the
 * package for the run and restores it afterwards, in a `finally`, so an
 * interrupted run does not leave the working tree modified.
 *
 * **2. A missing database.** 7 suites talk to Postgres. Without `DATABASE_URL`
 * they fail on connection. That is *not the same event* as a failing assertion
 * and must never be printed as though it were — conflating them is how a person
 * learns to ignore the output, which is the failure mode this project keeps
 * rediscovering.
 *
 * So there are three outcomes here, not two: **passed**, **could not run**, and
 * **failed**. Only the third is a defect, and only the third sets the exit code.
 *
 * Run: npx tsx scripts/verify-all.mts
 *      npx tsx scripts/verify-all.mts --quiet    (one line per suite)
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPTS = path.join(ROOT, "scripts");
const SERVER_ONLY = path.join(ROOT, "node_modules", "server-only", "index.js");

const quiet = process.argv.includes("--quiet");

type Outcome = "passed" | "no-database" | "failed";
interface Result {
  name: string;
  outcome: Outcome;
  ms: number;
  output: string;
}

/** Tells "the database is absent" apart from "an assertion failed". */
function classify(output: string, ok: boolean): Outcome {
  if (ok) return "passed";
  if (/DATABASE_URL|PrismaClientInitializationError|Can't reach database server/i.test(output)) {
    return "no-database";
  }
  return "failed";
}

function suites(): string[] {
  return fs
    .readdirSync(SCRIPTS)
    .filter((f) => /^verify-.+\.m?ts$/.test(f) && f !== "verify-all.mts")
    .sort();
}

function run(): Result[] {
  const results: Result[] = [];

  for (const file of suites()) {
    const started = Date.now();
    let output = "";
    let ok = true;

    try {
      output = execFileSync("npx", ["tsx", path.join(SCRIPTS, file)], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
      });
    } catch (err) {
      ok = false;
      const e = err as { stdout?: string; stderr?: string; message?: string };
      output = `${e.stdout ?? ""}${e.stderr ?? ""}` || e.message || "no output";
    }

    const outcome = classify(output, ok);
    results.push({ name: file, outcome, ms: Date.now() - started, output });

    const mark = outcome === "passed" ? "  ok  " : outcome === "no-database" ? " skip " : " FAIL ";
    console.log(`${mark} ${file.padEnd(42)} ${String(Date.now() - started).padStart(6)}ms`);
  }

  return results;
}

console.log(`Running ${suites().length} suites\n`);

// `server-only` throws by design outside a Server Component, which would abort
// 22 suites before their first check. Stubbed for the run and always put back.
const hadStub = fs.existsSync(SERVER_ONLY);
const original = hadStub ? fs.readFileSync(SERVER_ONLY) : null;

let results: Result[];
try {
  if (hadStub) fs.writeFileSync(SERVER_ONLY, "");
  results = run();
} finally {
  if (original !== null) fs.writeFileSync(SERVER_ONLY, original);
}

const passed = results.filter((r) => r.outcome === "passed");
const skipped = results.filter((r) => r.outcome === "no-database");
const failed = results.filter((r) => r.outcome === "failed");

console.log(`\n${"─".repeat(62)}`);
console.log(`${passed.length} passed · ${skipped.length} need a database · ${failed.length} failed`);

if (skipped.length > 0) {
  // Said plainly, every run, so nobody reads a skip as a defect — or, worse,
  // gets used to seeing something that looks like one.
  console.log(
    `\nNot run (no DATABASE_URL — these need Postgres, and their absence is\n` +
      `not a defect): ${skipped.map((r) => r.name.replace(/^verify-|\.m?ts$/g, "")).join(", ")}`
  );
}

if (failed.length > 0) {
  console.log(`\n${"─".repeat(62)}\nFailures\n`);
  for (const r of failed) {
    console.log(`### ${r.name}`);
    const lines = r.output.split("\n");
    const interesting = lines.filter((l) => /^FAIL|Error|error/.test(l));
    console.log((interesting.length > 0 ? interesting : lines.slice(-25)).join("\n"));
    console.log("");
  }
}

console.log(
  failed.length === 0
    ? "\nEverything that could run, ran, and passed.\n"
    : `\n${failed.length} suite(s) failed.\n`
);

// Only a real assertion failure fails the run. A missing database is a fact
// about the machine, and failing on it would train everyone to ignore this.
process.exit(failed.length === 0 ? 0 : 1);
