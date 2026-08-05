/**
 * Proves the staff assistant cannot do anything the person using it could not.
 *
 * The customer assistant only ever proposes navigation. This one proposes
 * **mutations** — verify a business, put a rider on an order, resolve a case —
 * which is a different order of risk, and the whole design rests on one claim:
 *
 * **Every action is a request to an endpoint that already exists, sent by the
 * browser, with the staff session it already has.**
 *
 * That claim is what these checks defend. If a future change made the server
 * execute an action itself, it would be running as whoever the assistant is,
 * and a DISPATCHER would silently gain whatever an OWNER can do. So the tests
 * assert the *shape* of what comes back as much as the filtering: a mutation is
 * a described request with a confirmation sentence, never a done deed.
 *
 * The second half is the same idea as the customer side: a model asked to be
 * helpful will invent an id, and an invented id in a "put Jean on this" button
 * is a rider dispatched to the wrong customer. Nothing outside the scope the
 * route built from its own queries survives.
 *
 * Run: npx tsx scripts/verify-staff-assistant.ts
 */
import {
  acceptStaffActions,
  staffRequest,
  isMutation,
  STAFF_ACTION_KINDS,
  type StaffScope,
} from "../src/lib/ai/assistant/staffActions";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const SCOPE: StaffScope = {
  orderIds: ["order-1", "order-2"],
  merchantIds: ["merch-1"],
  caseIds: ["case-1"],
  customerIds: ["cust-1"],
  riderIds: ["rider-1"],
};

console.log("\nWhat the console is actually looking at");
check(
  "an order on the queue can be opened",
  acceptStaffActions([{ kind: "OPEN_ORDER", ref: "order-1", label: "Open UNL-4821" }], SCOPE).length === 1
);
check(
  "a merchant on the list can be verified",
  acceptStaffActions([{ kind: "VERIFY_MERCHANT", ref: "merch-1", label: "Verify" }], SCOPE).length === 1
);
check(
  "a rider on shift can be put on an order",
  acceptStaffActions(
    [{ kind: "ASSIGN_RIDER", ref: "order-1", riderId: "rider-1", label: "Assign Jean" }],
    SCOPE
  ).length === 1
);

console.log("\nAnything it made up is discarded before a button is drawn");
check(
  "an order id nobody loaded",
  acceptStaffActions([{ kind: "OPEN_ORDER", ref: "order-999", label: "Open" }], SCOPE).length === 0,
  "a plausible-looking id in a staff button is somebody else's order"
);
check(
  "a merchant id nobody loaded",
  acceptStaffActions([{ kind: "VERIFY_MERCHANT", ref: "merch-999", label: "Verify" }], SCOPE).length === 0,
  "verifying the wrong business puts it in front of customers"
);
check(
  "a rider who is not on shift",
  acceptStaffActions(
    [{ kind: "ASSIGN_RIDER", ref: "order-1", riderId: "rider-999", label: "Assign" }],
    SCOPE
  ).length === 0
);
check(
  "an assignment with no rider at all",
  acceptStaffActions([{ kind: "ASSIGN_RIDER", ref: "order-1", label: "Assign somebody" }], SCOPE).length === 0,
  "'assign somebody' is a wish, not an action, and a button that guesses is worse than none"
);
check(
  "a capability that does not exist",
  acceptStaffActions([{ kind: "REFUND_ORDER", ref: "order-1", label: "Refund" }], SCOPE).length === 0,
  "a button promising something nothing here can do is a promise to a customer"
);
check(
  "a capability that sounds real",
  acceptStaffActions([{ kind: "DELETE_ORDER", ref: "order-1", label: "Delete" }], SCOPE).length === 0
);
check("junk", acceptStaffActions(["yes", 7, null, {}], SCOPE).length === 0);
check("a non-array", acceptStaffActions("VERIFY_MERCHANT", SCOPE).length === 0);
check(
  "an unlabelled action",
  acceptStaffActions([{ kind: "OPEN_ORDER", ref: "order-1" }], SCOPE).length === 0
);
check(
  "the same action twice becomes one",
  acceptStaffActions(
    [
      { kind: "OPEN_ORDER", ref: "order-1", label: "Open" },
      { kind: "OPEN_ORDER", ref: "order-1", label: "Open it" },
    ],
    SCOPE
  ).length === 1
);
check(
  "a wall of buttons is capped at four",
  acceptStaffActions(
    Array.from({ length: 12 }, (_, i) => ({ kind: "OPEN_ORDER", ref: i % 2 ? "order-1" : "order-2", label: `x${i}` })),
    SCOPE
  ).length <= 4
);

console.log("\nNothing is done on the server — a button is only ever described");
for (const kind of STAFF_ACTION_KINDS) {
  const req = staffRequest({ kind, ref: "x", riderId: "rider-1", label: "x" });
  if (isMutation(kind)) {
    check(
      `${kind} is a described request, not a result`,
      req.type === "request" && req.method === "PATCH" && typeof req.url === "string" && req.url.startsWith("/api/"),
      "the browser calls it with the staff session, so the endpoint's own gate decides"
    );
    check(
      `${kind} says what it will do before it does it`,
      req.type === "request" && req.confirm.length > 10 && req.confirm.includes("?"),
      "the risk of an actionable chat is the tap you make without reading"
    );
  } else {
    check(`${kind} is a plain link`, req.type === "link" && req.href.startsWith("/admin/"));
  }
}

console.log("\nAnd every mutation lands on an endpoint that already exists");
const ENDPOINTS: Record<string, string> = {
  VERIFY_MERCHANT: "/api/merchants/",
  CONFIRM_TRADING: "/api/merchants/",
  ASSIGN_RIDER: "/api/orders/",
  RESOLVE_CASE: "/api/support/",
};
for (const [kind, prefix] of Object.entries(ENDPOINTS)) {
  const req = staffRequest({
    kind: kind as (typeof STAFF_ACTION_KINDS)[number],
    ref: "abc",
    riderId: "rider-1",
    label: "x",
  });
  check(
    `${kind} → ${prefix}…`,
    req.type === "request" && req.url.startsWith(prefix),
    "a new endpoint would be a new gate to get right; these are the ones the screens already use"
  );
}

console.log(
  `\n${failures === 0 ? "It suggests. A person presses, and their name is on it." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
