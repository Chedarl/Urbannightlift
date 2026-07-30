/**
 * The support queue, proved to answer the right case first.
 *
 * Two rules matter: the desk works on cases where the customer is waiting on
 * *us*, and among those it answers the worst breach first — not the newest
 * arrival. Everything else follows from those.
 */
import {
  isOpen,
  isWaitingOnUs,
  minutesWaiting,
  slaState,
  bySla,
  readCase,
  RESPONSE_TARGET_MIN,
  type CaseInput,
} from "../src/lib/support/sla";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

const NOW = new Date("2026-07-30T01:00:00Z");
const ago = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

const base: CaseInput = {
  status: "NEW",
  priority: "NORMAL",
  createdAt: ago(5),
  lastCustomerMessageAt: null,
  lastStaffMessageAt: null,
};

console.log("\n— whose turn is it —");
{
  check("a brand-new case is ours", isWaitingOnUs(base));
  check("customer spoke last → ours", isWaitingOnUs({ ...base, status: "IN_PROGRESS", lastCustomerMessageAt: ago(3), lastStaffMessageAt: ago(30) }));
  check("we spoke last → not ours", !isWaitingOnUs({ ...base, status: "IN_PROGRESS", lastCustomerMessageAt: ago(30), lastStaffMessageAt: ago(3) }));
  check("parked on the customer → not ours", !isWaitingOnUs({ ...base, status: "WAITING_ON_CUSTOMER", lastCustomerMessageAt: ago(3) }));
  check("resolved → not ours", !isWaitingOnUs({ ...base, status: "RESOLVED" }));
  check("closed → not ours", !isWaitingOnUs({ ...base, status: "CLOSED" }));
}

console.log("\n— open vs done —");
{
  check("NEW is open", isOpen("NEW"));
  check("WAITING_ON_CUSTOMER is open", isOpen("WAITING_ON_CUSTOMER"));
  check("RESOLVED is not open", !isOpen("RESOLVED"));
  check("CLOSED is not open", !isOpen("CLOSED"));
}

console.log("\n— how long, and against what promise —");
{
  check("waiting counts from the customer's last word", minutesWaiting({ ...base, status: "IN_PROGRESS", lastCustomerMessageAt: ago(20), lastStaffMessageAt: ago(40) }, NOW) === 20);
  check("a new case waits from when it opened", minutesWaiting({ ...base, createdAt: ago(8) }, NOW) === 8);
  check("not our turn → no wait", minutesWaiting({ ...base, status: "RESOLVED" }, NOW) === null);

  // NORMAL target is 120 min. 130 = breached, 95 = due soon (>=90), 30 = ok.
  check("past target is breached", slaState({ ...base, createdAt: ago(130) }, NOW) === "BREACHED");
  check("last quarter is due soon", slaState({ ...base, createdAt: ago(95) }, NOW) === "DUE_SOON", slaState({ ...base, createdAt: ago(95) }, NOW));
  check("comfortably inside is ok", slaState({ ...base, createdAt: ago(30) }, NOW) === "OK");
  check("not our turn is idle", slaState({ ...base, status: "WAITING_ON_CUSTOMER", lastCustomerMessageAt: ago(3) }, NOW) === "IDLE");

  // Priority changes the window: URGENT breaches in 15 min.
  check("urgent breaches fast", slaState({ ...base, priority: "URGENT", createdAt: ago(20) }, NOW) === "BREACHED");
  check("the same wait is fine at low priority", slaState({ ...base, priority: "LOW", createdAt: ago(20) }, NOW) === "OK");
  check("targets are ordered urgent<high<normal<low", RESPONSE_TARGET_MIN.URGENT < RESPONSE_TARGET_MIN.HIGH && RESPONSE_TARGET_MIN.HIGH < RESPONSE_TARGET_MIN.NORMAL && RESPONSE_TARGET_MIN.NORMAL < RESPONSE_TARGET_MIN.LOW);
}

console.log("\n— the queue sorts worst-first —");
{
  const rows = [
    { id: "resolved", ...readMini({ ...base, status: "RESOLVED" }) },
    { id: "ok", ...readMini({ ...base, createdAt: ago(10) }) },
    { id: "breached-old", ...readMini({ ...base, createdAt: ago(200) }) },
    { id: "breached-older", ...readMini({ ...base, priority: "URGENT", createdAt: ago(400) }) },
    { id: "due", ...readMini({ ...base, createdAt: ago(95) }) },
  ].sort(bySla);
  check("a breach leads", rows[0].sla === "BREACHED", rows[0].id);
  check("the longest-overdue breach is first", rows[0].id === "breached-older", rows[0].id);
  check("due-soon beats ok", rows.findIndex((r) => r.id === "due") < rows.findIndex((r) => r.id === "ok"));
  check("resolved sinks to the bottom", rows[rows.length - 1].id === "resolved", rows[rows.length - 1].id);
}

console.log("\n— readCase agrees with the parts —");
{
  const r = readCase({ ...base, createdAt: ago(130) }, NOW);
  check("open, ours, breached, with a wait and a target", r.open && r.waitingOnUs && r.sla === "BREACHED" && r.waited === 130 && r.targetMin === 120);
}

function readMini(c: CaseInput) {
  return { sla: slaState(c, NOW), waited: minutesWaiting(c, NOW), open: isOpen(c.status) };
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
