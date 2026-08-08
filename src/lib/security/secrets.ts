import "server-only";

/**
 * Which secret each signed thing is actually using, and whether that is safe.
 *
 * ## The shape of the problem
 *
 * Every signing secret in this product falls back through a chain, ending in a
 * literal written in this open repository:
 *
 * ```
 * CUSTOMER_SESSION_SECRET || SUPABASE_SECRET_KEY || DATABASE_URL || "unl-dev-…"
 * ```
 *
 * The same shape guards customer sessions, merchant sessions, ambassador
 * sessions, the order-access cookie, watch links, merchant ping links and
 * welcome links. It exists so a developer can clone the repo and have things
 * work, which is a reasonable thing to want.
 *
 * **It is not currently exploitable**: Vercel always sets `DATABASE_URL`, so
 * every chain lands on a real secret. But if it ever did reach the literal,
 * anybody who has read this repository could forge a customer session, an
 * order-access cookie or a watch link — and it would fail **completely
 * silently**, with every screen appearing to work perfectly. That is the worst
 * possible failure mode: total compromise, zero signal.
 *
 * ## What this module does about it
 *
 * Two things, and neither of them changes the fallback chain, because removing
 * it would break local development for no security gain in production:
 *
 *  1. **Refuse to answer with a literal in production.** `assertProductionSecrets`
 *     throws at startup rather than serving a single request signed with a
 *     public constant. A site that will not boot is far better than a site that
 *     boots with forgeable sessions.
 *  2. **Say which one is in use.** `secretStatus()` feeds a readout on
 *     `/admin/settings`, beside the maps, mail and AI panels. This codebase has
 *     now been bitten three separate times by a misconfiguration that was
 *     invisible on every screen; the answer each time was to put it on one.
 *
 * Only the **variable name** is ever reported. Never a value, never a prefix,
 * never a length.
 */

/** A secret this product signs something with, and where it may come from. */
interface Chain {
  /** What breaks if this is wrong. */
  label: string;
  /** In preference order, exactly as the consuming module reads them. */
  names: string[];
  /** The literal that module falls back to. Its presence is the failure. */
  literal: string;
}

const CHAINS: Chain[] = [
  {
    label: "Customer sessions",
    names: ["CUSTOMER_SESSION_SECRET", "SUPABASE_SECRET_KEY", "DATABASE_URL"],
    literal: "unl-dev-customer-session-secret",
  },
  {
    label: "Merchant sessions",
    names: ["MERCHANT_SESSION_SECRET", "CUSTOMER_SESSION_SECRET", "SUPABASE_SECRET_KEY", "DATABASE_URL"],
    literal: "unl-dev-secret",
  },
  {
    label: "Ambassador sessions",
    names: ["AMBASSADOR_SESSION_SECRET", "CUSTOMER_SESSION_SECRET", "SUPABASE_SECRET_KEY", "DATABASE_URL"],
    literal: "unl-dev-ambassador-session-secret",
  },
  {
    label: "Order access",
    names: ["ORDER_ACCESS_SECRET", "SUPABASE_SECRET_KEY", "DATABASE_URL"],
    literal: "unl-dev-order-access-secret",
  },
  {
    label: "Share-my-delivery links",
    names: ["WATCH_LINK_SECRET", "ORDER_ACCESS_SECRET", "SUPABASE_SECRET_KEY", "DATABASE_URL"],
    literal: "unl-dev-watch-link-secret",
  },
  {
    label: "Merchant ping links",
    names: ["MERCHANT_PING_SECRET", "WATCH_LINK_SECRET", "ORDER_ACCESS_SECRET", "SUPABASE_SECRET_KEY", "DATABASE_URL"],
    literal: "unl-dev-merchant-ping-secret",
  },
  {
    label: "Welcome card links",
    names: ["WELCOME_LINK_SECRET", "WATCH_LINK_SECRET", "ORDER_ACCESS_SECRET", "SUPABASE_SECRET_KEY", "DATABASE_URL"],
    literal: "unl-dev-welcome-link-secret",
  },
  {
    // Not a signature — the salt that stops the rate-limit table being turned
    // back into a list of IP addresses by anyone who obtains a copy of it. A
    // rainbow table over the whole IPv4 space is otherwise trivial.
    label: "Rate-limit hashing",
    names: ["RATE_LIMIT_SALT", "CUSTOMER_SESSION_SECRET", "SUPABASE_SECRET_KEY", "DATABASE_URL"],
    literal: "unl-dev-rate-limit-salt",
  },
];

export interface SecretRow {
  label: string;
  /** The variable actually supplying it, or null when nothing is set. */
  source: string | null;
  /**
   * True when this is its own dedicated variable rather than something
   * borrowed. Borrowing `DATABASE_URL` as an HMAC key works, but it means one
   * rotation silently invalidates every session and every live share link.
   */
  dedicated: boolean;
  /** True when it has fallen through to the literal in the repository. */
  usingLiteral: boolean;
}

export function secretStatus(): SecretRow[] {
  return CHAINS.map((chain) => {
    const source = chain.names.find((n) => (process.env[n] ?? "").trim().length > 0) ?? null;
    return {
      label: chain.label,
      source,
      dedicated: source === chain.names[0],
      usingLiteral: source === null,
    };
  });
}

/**
 * Refuses to run in production on a secret anybody can read in the repository.
 *
 * Called once from instrumentation, so it fires at boot rather than on the
 * unlucky request that happens to need a session.
 */
export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;

  const exposed = secretStatus().filter((row) => row.usingLiteral);
  if (exposed.length === 0) return;

  throw new Error(
    `Refusing to start: ${exposed.map((r) => r.label).join(", ")} would be signed with a ` +
      `fallback secret that is published in this repository, so sessions and links could be ` +
      `forged by anyone. Set ${CHAINS.filter((c) => exposed.some((e) => e.label === c.label))
        .map((c) => c.names[0])
        .join(", ")} and redeploy.`
  );
}

/**
 * The advice line for the panel.
 *
 * Everything working off `DATABASE_URL` is safe today and fragile tomorrow —
 * rotating a database password should not sign every customer out and kill
 * every share link in flight. That is worth saying once, plainly, rather than
 * discovering during a rotation.
 */
export function secretAdvice(rows: SecretRow[]): string | null {
  if (rows.some((r) => r.usingLiteral)) {
    return "Some secrets are falling back to a value published in this repository. Set the dedicated variables and redeploy before taking real orders.";
  }
  const borrowed = rows.filter((r) => !r.dedicated);
  if (borrowed.length > 0) {
    return `${borrowed.length} of ${rows.length} are borrowing another variable. It works, but rotating that one variable will sign every customer out and break every share link in flight.`;
  }
  return null;
}
