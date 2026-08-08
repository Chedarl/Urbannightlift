/**
 * Runs once when the server starts, before it will answer anything.
 *
 * The only thing here is the check that must not be lazy: a signing secret
 * falling through to the literal published in this repository would let anybody
 * forge a customer session, an order-access cookie or a share link — and it
 * would do so **silently**, with every screen looking perfectly healthy. That
 * is the one failure in this product where refusing to boot is plainly better
 * than carrying on.
 *
 * Deliberately nothing else lives here. A slow or flaky startup hook makes
 * every cold start slower, and this runs on every serverless instance.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertProductionSecrets } = await import("@/lib/security/secrets");
  assertProductionSecrets();
}
