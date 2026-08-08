/**
 * Proves that reading a sentence into a form cannot do anything but save typing.
 *
 * The model reads prose; `shapeIntake` decides what is allowed into a draft.
 * Two rules carry the whole safety of the feature, and both are provable
 * offline:
 *
 *  1. **A service that is switched off can never come back.** Otherwise a
 *     sentence about a parcel routes somebody into a paused service and a form
 *     that refuses to submit — the exact dead end v33 was spent digging the
 *     catalogue out of.
 *  2. **A place is never invented.** An address the model guessed is far more
 *     dangerous than a blank one, because a blank field gets filled in and a
 *     wrong one gets confirmed by somebody in a hurry at midnight.
 *
 * What is deliberately NOT proved here is the reading itself. Whether "deux
 * pizzas" comes back as food is a question only real sentences can answer, and
 * pretending otherwise with a fixture would be the same false confidence that
 * let five vision features ship unproved.
 *
 * Run: npx tsx scripts/verify-intake.ts
 */
import { shapeIntake } from "../src/lib/ai/intake";
import type { ServiceType } from "@prisma/client";

const LIVE = ["FOOD_PICKUP", "MEDICINE_PICKUP", "SMALL_PARCEL"] as ServiceType[];

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nOnly a service that is actually switched on");
check(
  "an enabled service survives",
  shapeIntake({ itemDescription: "two pizzas", serviceType: "FOOD_PICKUP" }, LIVE)?.serviceType ===
    "FOOD_PICKUP"
);
check(
  "a paused service is refused, not passed through",
  shapeIntake({ itemDescription: "urgent thing", serviceType: "URGENT_ITEM" }, LIVE)?.serviceType !==
    "URGENT_ITEM",
  "routing somebody into a paused service is a form that will not submit"
);
check(
  "and falls back to something live",
  LIVE.includes(
    shapeIntake({ itemDescription: "urgent thing", serviceType: "URGENT_ITEM" }, LIVE)!.serviceType
  )
);
check(
  "an invented service is refused",
  LIVE.includes(shapeIntake({ itemDescription: "a thing", serviceType: "TELEPORT" }, LIVE)!.serviceType)
);
check(
  "a missing service still lands somewhere live",
  LIVE.includes(shapeIntake({ itemDescription: "a thing" }, LIVE)!.serviceType)
);
check(
  "lower case is accepted",
  shapeIntake({ itemDescription: "pills", serviceType: "medicine_pickup" }, LIVE)?.serviceType ===
    "MEDICINE_PICKUP"
);
check(
  "with nothing enabled there is no draft at all",
  shapeIntake({ itemDescription: "two pizzas", serviceType: "FOOD_PICKUP" }, []) === null,
  "a closed service must not produce a form to fill"
);

console.log("\nA place is carried, never conjured");
{
  const said = shapeIntake(
    { itemDescription: "two pizzas", pickupLocation: "Dolcezza", deliveryLocation: "Bastos" },
    LIVE
  )!;
  check("a named pickup comes through", said.pickupLocation === "Dolcezza");
  check("a named destination comes through", said.deliveryLocation === "Bastos");
}
{
  const silent = shapeIntake({ itemDescription: "two pizzas" }, LIVE)!;
  check(
    "an unsaid pickup stays empty",
    silent.pickupLocation === "",
    "a blank box gets filled in; a guessed address gets confirmed"
  );
  check("an unsaid destination stays empty", silent.deliveryLocation === "");
}

console.log("\nNothing to order is no draft");
check("empty is nothing", shapeIntake({ itemDescription: "" }, LIVE) === null);
check("two characters is nothing", shapeIntake({ itemDescription: "ok" }, LIVE) === null);
check("whitespace is nothing", shapeIntake({ itemDescription: "    " }, LIVE) === null);

console.log("\nQuantity is read, never assumed");
check("a stated number survives", shapeIntake({ itemDescription: "pizza", quantity: 3 }, LIVE)?.quantity === 3);
check("no number means one", shapeIntake({ itemDescription: "pizza" }, LIVE)?.quantity === 1);
check("zero means one", shapeIntake({ itemDescription: "pizza", quantity: 0 }, LIVE)?.quantity === 1);
check(
  "an absurd number means one",
  shapeIntake({ itemDescription: "pizza", quantity: 100000 }, LIVE)?.quantity === 1,
  "nobody orders ten thousand of anything on a motorbike at 1 AM"
);
check("a fraction is rounded", shapeIntake({ itemDescription: "pizza", quantity: 2.4 }, LIVE)?.quantity === 2);

console.log("\nAnd nothing can run away with a field");
check(
  "the description is bounded",
  shapeIntake({ itemDescription: "x".repeat(5000) }, LIVE)!.itemDescription.length === 1000
);
check(
  "a location is bounded",
  shapeIntake({ itemDescription: "pizza", pickupLocation: "y".repeat(900) }, LIVE)!.pickupLocation.length ===
    300
);

console.log(
  `\n${failures === 0 ? "It fills a form, and it cannot do anything else." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
