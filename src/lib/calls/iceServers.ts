/**
 * The shape of an ICE configuration, and how to decide which one we have.
 *
 * Split out of `ice.ts` — which is `server-only`, because it holds the API
 * token — so that the parts with no secret in them can be proved. A pure
 * function guarded by `server-only` is a pure function nothing can test, and
 * `normaliseIceServers` is the one that has to survive a provider returning
 * garbage.
 *
 * ## Where the call's media goes when the two phones cannot reach each other
 *
 * ## Why a relay is not optional here
 *
 * Roughly a fifth of mobile WebRTC connections need a TURN relay, because
 * carrier-grade NAT means many subscribers share one public address and neither
 * end can be dialled directly. On Cameroonian mobile networks that is the
 * common case, not the edge case. STUN-only would mean a call feature that
 * fails for one customer in five with no pattern anybody could describe.
 *
 * ## Three modes, and the module never assumes one
 *
 * `cloudflare` mints short-lived credentials from Cloudflare's TURN service,
 * whose free tier is 1 TB of egress a month — about thirty-three thousand hours
 * of relayed audio, which this business will not reach. It is the recommendation
 * because signing up needs an email address and no phone verification.
 *
 * That last point is not a detail. `lib/voice/speech.ts` records the owner
 * being unable to complete a vendor signup because Cameroonian numbers were
 * rejected, and the same note appears about WhatsApp Cloud API and Google Maps.
 * A plan that routes through a signup flow that may refuse him is a plan to
 * ship nothing, so `static` exists: any coturn on any VPS, two env vars, no
 * code change.
 *
 * `none` is honest rather than broken. It returns STUN only and tells the
 * caller `relayCapable: false`, so the screen can say "this may not connect on
 * some networks" **before** the call instead of failing silently during it.
 *
 * ## The credential is a lease, not a key
 *
 * Minted per call, server-side, capped at ten minutes in code rather than only
 * in the request body. The API token never reaches a browser. A leaked
 * credential buys relay bandwidth against the free allowance and nothing
 * else — it does not authorise joining a call, because a call needs the channel
 * name and a token neither of which live here.
 */

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceGrant {
  iceServers: IceServer[];
  /** False means STUN only: say so on screen before the call, not after. */
  relayCapable: boolean;
}

export const MAX_TTL_SECONDS = 600;

/** Public STUN, used alone in `none` mode and alongside TURN otherwise. */
const STUN: IceServer[] = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
];

export type IceMode = "cloudflare" | "static" | "none";

/** The only variables this decision reads. */
export interface IceEnv {
  CLOUDFLARE_TURN_KEY_ID?: string;
  CLOUDFLARE_TURN_API_TOKEN?: string;
  TURN_URLS?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
  /*
    `process.env` is an index signature of `string | undefined`, and TypeScript
    will not see that as overlapping with an interface of only optional named
    keys. This makes the real environment assignable without pretending the
    function reads more of it than it does.
  */
  [key: string]: string | undefined;
}

/**
 * Which provider this deployment actually has.
 *
 * Takes a plain record rather than `NodeJS.ProcessEnv` — it reads four keys and
 * nothing else, and demanding the full env type means a test has to fabricate a
 * `NODE_ENV` to ask a question that does not involve one.
 */
export function iceProviderMode(env: IceEnv): IceMode {
  if (env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN) return "cloudflare";
  if (env.TURN_URLS && env.TURN_USERNAME && env.TURN_CREDENTIAL) return "static";
  return "none";
}

/**
 * Turn whatever a provider returned into something a browser can use.
 *
 * Pure and exported so the suite can feed it garbage. **It never throws**: an
 * ICE provider having a bad day must degrade the call to STUN-only, not 500 the
 * endpoint that was about to set one up.
 */
export function normaliseIceServers(raw: unknown): IceGrant {
  const servers: IceServer[] = [];
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { iceServers?: unknown }).iceServers)
      ? ((raw as { iceServers: unknown[] }).iceServers)
      : [];

  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const urls = e.urls;
    const ok =
      typeof urls === "string" ||
      (Array.isArray(urls) && urls.length > 0 && urls.every((u) => typeof u === "string"));
    if (!ok) continue;

    const server: IceServer = { urls: urls as string | string[] };
    if (typeof e.username === "string" && typeof e.credential === "string") {
      server.username = e.username;
      server.credential = e.credential;
    }
    servers.push(server);
  }

  const relayCapable = servers.some((s) =>
    (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => u.startsWith("turn:") || u.startsWith("turns:"))
  );

  if (!relayCapable) return { iceServers: [...STUN], relayCapable: false };

  /*
    TURN over TLS on 443, first.

    Some Cameroonian mobile APNs block outbound UDP on anything but the usual
    ports, and a relay on 443 over TCP is the one shape that gets through a
    restrictive middlebox. Ordering it ahead of the UDP entries means the
    retry path reaches for it early rather than after a full timeout.
  */
  servers.sort((a, b) => Number(has443(b)) - Number(has443(a)));
  return { iceServers: servers, relayCapable: true };
}

function has443(s: IceServer): boolean {
  return (Array.isArray(s.urls) ? s.urls : [s.urls]).some(
    (u) => u.startsWith("turns:") && u.includes(":443")
  );
}

