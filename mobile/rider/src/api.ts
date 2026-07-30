import Constants from "expo-constants";
import { accessToken } from "./auth";
import type { Fix } from "./tracking";

/**
 * The app's only way of talking to the server.
 *
 * Every call goes to the same endpoints the website calls, authenticated with
 * the Supabase access token as a bearer header. There is deliberately no
 * mobile-only API: the rules about who may accept a job, record a receipt or
 * move an order live once, on the server, and this app is just another client
 * of them.
 */

const BASE: string =
  (Constants.expoConfig?.extra as { apiBase?: string } | undefined)?.apiBase ??
  "https://urbannighlift.com";

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const token = await accessToken();
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    const data = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, data };
  } catch {
    // Offline is not an error worth throwing over — every caller has something
    // sensible to show instead, and a rider on a bad connection should see a
    // stale screen rather than a crash.
    return { ok: false, status: 0, data: null };
  }
}

export interface RiderMe {
  rider: {
    id: string;
    fullName: string;
    phone: string | null;
    photoUrl: string | null;
    vehicleRef: string | null;
    isOnline: boolean;
    idVerified: boolean;
  };
  tonight: { jobs: number; earnedXaf: number; serviceOpen: boolean };
  standing: { earnedXaf: number; deliveries: number; rating: number | null; ratingCount: number };
  float: {
    limitXaf: number;
    balanceXaf: number;
    advancedXaf: number;
    spendableXaf: number;
    suspended: boolean;
  };
}

export interface Job {
  id: string;
  orderCode: string;
  status: string;
  serviceType: string;
  paymentMethod: string;
  customerName: string;
  pickup: { text: string; zone: string | null; lat: number | null; lng: number | null };
  delivery: { text: string; zone: string | null; lat: number | null; lng: number | null };
  acceptedAt: string | null;
  offeredAt: string | null;
  payoutXaf: number | null;
  payoutIsEstimate: boolean;
  isShopping: boolean;
}

export const api = {
  me: () => request<RiderMe>("/api/rider/me"),
  jobs: () => request<{ jobs: Job[] }>("/api/rider/jobs"),
  job: (id: string) => request<{ job: unknown }>(`/api/rider/jobs/${id}`),

  setOnline: (isOnline: boolean) =>
    request("/api/rider/availability", {
      method: "POST",
      body: JSON.stringify({ isOnline }),
    }),

  answerAssignment: (orderId: string, accept: boolean, reason?: string) =>
    request(`/api/orders/${orderId}/assignment`, {
      method: "POST",
      body: JSON.stringify({ accept, reason }),
    }),

  setStatus: (orderId: string, status: string, extra: Record<string, unknown> = {}) =>
    request(`/api/orders/${orderId}/status`, {
      method: "POST",
      body: JSON.stringify({ status, ...extra }),
    }),

  submitProof: (orderId: string, stage: "PICKUP" | "DELIVERY", payload: Record<string, unknown>) =>
    request(`/api/orders/${orderId}/proof`, {
      method: "POST",
      body: JSON.stringify({ stage, ...payload }),
    }),

  recordGoods: (orderId: string, amountXaf: number, receiptUrl: string) =>
    request(`/api/orders/${orderId}/goods`, {
      method: "POST",
      body: JSON.stringify({ amountXaf, receiptUrl }),
    }),

  registerPushToken: (token: string, platform: "fcm" | "apns") =>
    request("/api/push", {
      method: "POST",
      body: JSON.stringify({ endpoint: token, platform }),
    }),
};

/**
 * Sends a batch of queued positions.
 *
 * Returns a plain boolean because the caller is the background task, which has
 * exactly one decision to make: clear the queue, or keep it for the next try.
 * A 403 counts as sent — the job is no longer theirs, so holding those
 * positions forever would block every later flush behind them.
 */
export async function postPositions(orderId: string, positions: Fix[]): Promise<boolean> {
  const res = await request(`/api/orders/${orderId}/location`, {
    method: "POST",
    body: JSON.stringify({ positions }),
  });
  return res.ok || res.status === 403 || res.status === 404;
}
