import "server-only";

import {
  normaliseIceServers,
  iceProviderMode,
  MAX_TTL_SECONDS,
  type IceEnv,
  type IceGrant,
  type IceServer,
} from "@/lib/calls/iceServers";

export * from "@/lib/calls/iceServers";

/** Public STUN, used alone in `none` mode and alongside TURN otherwise. */
const STUN: IceServer[] = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
];

/**
 * Credentials for one party of one call.
 *
 * The only impure function here, and it is wrapped so that every failure —
 * a timeout, a 403, malformed JSON — lands in the same place as no provider at
 * all: STUN only, `relayCapable: false`, and a screen that says so.
 */
export async function mintIceServers(env: IceEnv = process.env): Promise<IceGrant> {
  const mode = iceProviderMode(env);

  if (mode === "static") {
    return normaliseIceServers([
      ...STUN,
      {
        urls: (env.TURN_URLS ?? "").split(",").map((u) => u.trim()).filter(Boolean),
        username: env.TURN_USERNAME,
        credential: env.TURN_CREDENTIAL,
      },
    ]);
  }

  if (mode === "none") return { iceServers: [...STUN], relayCapable: false };

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_TURN_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        // Capped here as well as asked for: a provider that ignores the body
        // must not be able to hand out an hour-long lease.
        body: JSON.stringify({ ttl: MAX_TTL_SECONDS }),
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) return { iceServers: [...STUN], relayCapable: false };
    return normaliseIceServers(await res.json());
  } catch {
    return { iceServers: [...STUN], relayCapable: false };
  }
}
