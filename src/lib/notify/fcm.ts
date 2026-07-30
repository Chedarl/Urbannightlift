import "server-only";

/**
 * Firebase Cloud Messaging, for the store-installed apps.
 *
 * A Capacitor WebView does not implement the Push API, so the customer app and
 * the rider app cannot use Web Push at all — the OS hands them an FCM token
 * (Android) or an APNs token routed through FCM (iOS), and those go out over
 * this transport instead. Same audience, same ownership rules, different pipe.
 *
 * Written against the HTTP v1 API directly rather than pulling in
 * `firebase-admin`, which is a large dependency for one POST. The access token
 * is a signed JWT exchanged for a bearer token, cached until shortly before it
 * expires so a busy night is a handful of exchanges rather than one per push.
 *
 * Silently disabled until `FCM_SERVICE_ACCOUNT` is set, exactly as Web Push is
 * disabled until the VAPID keys are. Nothing here may ever fail an order: a
 * notification is a courtesy.
 */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let account: ServiceAccount | null | undefined;

function serviceAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) {
    account = null;
    return null;
  }
  try {
    // Accepts the JSON Firebase gives you, or that JSON base64-encoded — which
    // is what you end up with pasting a multi-line private key into a hosting
    // provider's environment editor.
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      account = null;
      return null;
    }
    // Environment editors commonly turn real newlines into the two characters
    // backslash-n, which makes the key unusable in a way that is hard to see.
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    account = parsed;
    return account;
  } catch {
    account = null;
    return null;
  }
}

export function fcmConfigured(): boolean {
  return serviceAccount() !== null;
}

let cachedToken: { value: string; expires: number } | null = null;

/** A Google OAuth access token for the messaging scope. */
async function accessToken(): Promise<string | null> {
  const sa = serviceAccount();
  if (!sa) return null;
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(claim)}`;

  try {
    const { createSign } = await import("node:crypto");
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    const signature = signer.sign(sa.private_key, "base64url");

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${signature}`,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    cachedToken = {
      value: data.access_token,
      expires: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return cachedToken.value;
  } catch {
    return null;
  }
}

export interface FcmResult {
  ok: boolean;
  /** True when the token is dead and the row should be pruned. */
  gone: boolean;
}

/**
 * Sends one message to one device token.
 *
 * `UNREGISTERED` and `INVALID_ARGUMENT` mean the app was uninstalled or the
 * token rotated; those come back as `gone` so the caller prunes the row. Any
 * other failure is transient and the row is kept — deleting a live device
 * because Google had a bad minute would silently stop somebody's alerts forever.
 */
export async function sendFcm(
  token: string,
  message: { title: string; body: string; url: string; tag?: string }
): Promise<FcmResult> {
  const sa = serviceAccount();
  const bearer = await accessToken();
  if (!sa || !bearer) return { ok: false, gone: false };

  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            // The tap target travels as data so both platforms' handlers can
            // read it; `notification.click_action` is Android-only.
            data: { url: message.url, ...(message.tag ? { tag: message.tag } : {}) },
            android: {
              priority: "high",
              notification: {
                // Collapses repeat alerts about the same order rather than
                // stacking five of them on a rider's lock screen.
                tag: message.tag,
                channel_id: "urban_night_lift",
              },
            },
            apns: {
              headers: { "apns-priority": "10", ...(message.tag ? { "apns-collapse-id": message.tag } : {}) },
              payload: { aps: { sound: "default" } },
            },
          },
        }),
      }
    );

    if (res.ok) return { ok: true, gone: false };

    const body = (await res.json().catch(() => ({}))) as {
      error?: { status?: string; details?: { errorCode?: string }[] };
    };
    const status = body.error?.status ?? "";
    const code = body.error?.details?.find((d) => d.errorCode)?.errorCode ?? "";
    const gone =
      res.status === 404 ||
      status === "NOT_FOUND" ||
      status === "INVALID_ARGUMENT" ||
      code === "UNREGISTERED";
    return { ok: false, gone };
  } catch {
    return { ok: false, gone: false };
  }
}
