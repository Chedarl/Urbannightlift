/**
 * Proves nobody is offered a way to pay that does not work.
 *
 * ## The bug
 *
 * Production has `mtnMerchantCode` set and **`orangeMerchantCode` null**. All
 * five order forms offered Orange Money regardless, and the payment card ended
 * with `if (!code) return null`.
 *
 * So a customer who chose Orange Money — roughly half the mobile-money market
 * in Cameroon — placed their order, reached the payment screen, and was shown
 * **nothing at all**: no code, no instructions, no error, no way to switch.
 * An order they could not pay for and a blank space where the answer should be.
 *
 * Nothing recorded it. No exception, no log line, no counter. From inside the
 * product it looked like a customer who wandered off — and the database says
 * five customers signed up and **not one order was ever completed**.
 *
 * ## What this checks, and why it is three things
 *
 * The fault needed two independent mistakes to reach a customer, so both halves
 * are checked, plus the shape of the fallback:
 *
 *  1. The rule itself — a method is offered only when it can be completed.
 *  2. That no form hardcodes the full list any more.
 *  3. That the payment card cannot return nothing.
 *
 * Checks 2 and 3 read source rather than behaviour, which is usually the weaker
 * kind of test. Here it is the right one: the thing that went wrong was a
 * literal array in five files and a bare `return null`, and those are facts
 * about the text.
 *
 * Run: npx tsx scripts/verify-payment-methods.ts
 */

import fs from "node:fs";
import path from "node:path";
import {
  configuredPaymentMethods,
  isPaymentMethodConfigured,
  unavailableMethodNotice,
  ALL_PAYMENT_METHODS,
} from "../src/lib/payments/methods";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");

console.log("Cash always works, because it needs nothing configured");
{
  check("with nothing set at all", configuredPaymentMethods({}).includes("CASH"));
  check("with both codes null", configuredPaymentMethods({ mtnMerchantCode: null, orangeMerchantCode: null }).includes("CASH"));
  check("and it is offered first", configuredPaymentMethods({})[0] === "CASH", "the option guaranteed to work should lead");
  check(
    "a customer is never left with no way to pay",
    configuredPaymentMethods({}).length >= 1,
    "an empty list is the one answer that cannot be right"
  );
}

console.log("\nA mobile money method needs a merchant code to be offered");
{
  // This is production's exact configuration, which is how the bug shipped.
  const live = { mtnMerchantCode: "653077160", orangeMerchantCode: null };
  const methods = configuredPaymentMethods(live);

  check("MTN is offered when its code is set", methods.includes("MTN_MOMO"));
  check(
    "Orange is NOT offered when its code is null",
    !methods.includes("ORANGE_MONEY"),
    "this is production's live configuration — offering it is how a customer reached a blank payment screen"
  );

  check("neither is offered with no codes", configuredPaymentMethods({}).length === 1);
  check(
    "both are offered when both are set",
    configuredPaymentMethods({ mtnMerchantCode: "1", orangeMerchantCode: "2" }).length === 3
  );

  // A field that exists but is empty is not configuration.
  for (const blank of ["", "   ", "\t"]) {
    check(
      `a blank code (${JSON.stringify(blank)}) does not count as configured`,
      !configuredPaymentMethods({ orangeMerchantCode: blank }).includes("ORANGE_MONEY")
    );
  }

  check(
    "isPaymentMethodConfigured agrees with the list",
    isPaymentMethodConfigured("MTN_MOMO", live) && !isPaymentMethodConfigured("ORANGE_MONEY", live)
  );
}

console.log("\nSomebody already stuck on an unconfigured method is told what to do");
{
  const live = { mtnMerchantCode: "653077160", orangeMerchantCode: null };
  for (const fr of [false, true]) {
    const notice = unavailableMethodNotice("ORANGE_MONEY", live, fr);
    check(`${fr ? "fr" : "en"}: it names the method`, notice.includes("Orange Money"));
    check(`${fr ? "fr" : "en"}: it offers what does work`, notice.includes("MTN MoMo"));
    check(
      `${fr ? "fr" : "en"}: it says the order is not lost`,
      /saved|enregistrée/i.test(notice),
      "somebody who cannot pay needs to know the order still exists"
    );
    check(`${fr ? "fr" : "en"}: it is a real sentence`, notice.length > 60 && notice.includes("."));
  }
}

console.log("\nNo order form hardcodes the list of payment methods");
{
  const formsDir = path.join(ROOT, "src/components/customer/order/forms");
  const forms = fs.readdirSync(formsDir).filter((f) => f.endsWith("Form.tsx"));
  check("the forms were found", forms.length >= 5, `only ${forms.length} in ${formsDir}`);

  for (const file of forms) {
    const src = fs.readFileSync(path.join(formsDir, file), "utf8");
    if (!src.includes("ORANGE_MONEY")) continue; // no payment chooser in this form

    check(
      `${file} asks which methods are available`,
      src.includes("usePaymentMethods") && src.includes("payMethods"),
      "it offers Orange Money but never checks whether Orange Money is configured"
    );
    check(
      `${file} filters its options`,
      /payMethods\.includes\(|\(payMethods as/.test(src),
      "importing the list and not using it is how the surface tokens failed"
    );
  }
}

console.log("\nAnd the payment screen can never render nothing");
{
  const raw = fs.readFileSync(path.join(ROOT, "src/components/customer/PaymentCard.tsx"), "utf8");
  /*
    Comments stripped first. The comment in that file *quotes* the bug —
    "`if (!code) return null`, which rendered nothing at all" — and a check that
    greps the raw text finds its own explanation and reports the fault as still
    present. `verify-wiring` learned this in v38 and `verify-design-tokens` in
    v44; this is the third time in one sitting, so it is plainly the default
    mistake rather than an unlucky one. A mention is not code.
  */
  const card = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  check(
    "the bare `if (!code) return null` is gone",
    !/if\s*\(!code\)\s*return null/.test(card),
    "that line is the whole bug: an order that cannot be paid, shown as a blank space"
  );
  check("the unconfigured case explains itself", card.includes("unavailableMethodNotice"));
  check(
    "and offers a way to reach a person",
    /wa\.me|whatsapp/i.test(card),
    "somebody who cannot pay must be able to say so"
  );
}

console.log("\nThe public settings endpoint says which methods work, and nothing more");
{
  const route = fs.readFileSync(path.join(ROOT, "src/app/api/settings/route.ts"), "utf8");
  const publicBlock = route.slice(route.indexOf("NextResponse.json("), route.indexOf("PATCH"));

  check("it publishes the available methods", publicBlock.includes("configuredPaymentMethods"));

  // The codes themselves belong to the one customer with an order to pay, on
  // the confirmation page — not in a response anybody can fetch.
  for (const secret of ["mtnMerchantCode", "orangeMerchantCode", "mtnUssdTemplate", "orangeUssdTemplate"]) {
    check(
      `it does not leak ${secret}`,
      !new RegExp(`${secret}\\s*:`).test(publicBlock),
      "merchant codes are not public settings"
    );
  }
}

console.log("\nEvery screen that offers a method asks which ones work");
{
  /*
    The filter shipped to the five service forms and stopped there. `OrderForm`
    — the router form, and the component `/order/new` actually renders — kept
    its hardcoded `["MTN_MOMO", "ORANGE_MONEY", "CASH"]`, so the fix was live
    everywhere except the one screen most customers see. That is the specific
    failure this checks: not "does the helper exist" but "does every chooser
    use it".
  */
  const choosers = [
    "src/components/customer/OrderForm.tsx",
    "src/components/customer/OrderReview.tsx",
    "src/components/customer/order/forms/FoodForm.tsx",
    "src/components/customer/order/forms/MedicineForm.tsx",
    "src/components/customer/order/forms/ParcelForm.tsx",
    "src/components/customer/order/forms/ErrandForm.tsx",
    "src/components/customer/order/forms/GroceryForm.tsx",
  ];

  for (const rel of choosers) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const name = rel.split("/").pop();
    check(`${name} asks which methods work`, code.includes("usePaymentMethods"));
    check(
      `${name} does not carry its own list of three`,
      !/\[\s*"(?:CASH|MTN_MOMO|ORANGE_MONEY)"[^\]]*"(?:CASH|MTN_MOMO|ORANGE_MONEY)"[^\]]*"(?:CASH|MTN_MOMO|ORANGE_MONEY)"\s*\]/.test(code),
      "a hardcoded triple is the bug, wherever it is written"
    );
  }
}

console.log("\nAnd the server refuses one that cannot be paid");
{
  /*
    The chooser filters a *client* list. A stale tab, a draft saved before a
    merchant code was pulled, or a hand-made request all reach the order route
    carrying whatever they like — and until this check the route took it. The
    result is worse than a hidden button: a customer who has committed, and a
    payment screen with nothing on it.
  */
  const route = fs
    .readFileSync(path.join(ROOT, "src/app/api/orders/route.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  check(
    "POST /api/orders checks the method against the configuration",
    route.includes("isPaymentMethodConfigured"),
    "the client filter is the only guard, and the client is not a guard"
  );
  check(
    "and refuses it with a reason the client can act on",
    route.includes("PAYMENT_METHOD_UNAVAILABLE"),
    "a bare 400 tells the customer nothing and the UI nothing"
  );
}

console.log(
  `\n${failures === 0 ? "Every way of paying that is offered is a way that works." : `${failures} check(s) FAILED — a customer could be offered a payment they cannot make.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
