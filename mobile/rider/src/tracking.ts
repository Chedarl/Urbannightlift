import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { postPositions } from "./api";

/**
 * The reason this app exists.
 *
 * The web rider app could never do this, and it was not a bug: a browser
 * suspends `watchPosition` when the screen sleeps or the tab is backgrounded, so
 * the moment a rider put their phone in their pocket — which is to say, the
 * moment they started riding — the customer's map froze. Every complaint about
 * tracking traced back to that one platform limit.
 *
 * A registered background task with an Android foreground service keeps
 * reporting with the screen off and the app closed. That is the whole point.
 *
 * Three things this has to get right, because a rider will not be watching:
 *
 *  - **It must stop by itself.** Tracking somebody after their shift is over is
 *    a betrayal of the permission they gave, so the task ends at DELIVERED and
 *    on sign-out, and there is no path where it silently continues.
 *  - **A dead-signal patch must cost nothing.** Positions that fail to send are
 *    queued on the device and flushed in one batch when signal returns. Yaoundé
 *    at 1 AM has plenty of these.
 *  - **It must be visible.** Android shows a permanent notification saying we
 *    are using location. That is required, and it is also right: nobody should
 *    be tracked by an app that hides it.
 */

export const TRACK_TASK = "unl-rider-location";
const QUEUE_KEY = "unl.tracking.queue";
const ACTIVE_KEY = "unl.tracking.active";
const MAX_QUEUE = 300;

export interface Fix {
  lat: number;
  lng: number;
  at: number;
}

/** Which order we are tracking for, if any. */
async function activeOrderId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_KEY);
}

async function readQueue(): Promise<Fix[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as Fix[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(fixes: Fix[]): Promise<void> {
  // Keep the newest. A queue that grows without bound on a long outage would
  // eventually fail to serialise, and the newest position is the one the map
  // actually needs.
  const trimmed = fixes.slice(-MAX_QUEUE);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed)).catch(() => {});
}

/**
 * Sends everything queued, and keeps it if the send fails.
 *
 * Deliberately all-or-nothing per flush: a partial success that dropped the
 * unsent half would lose positions silently, which is worse than sending a few
 * twice. The server takes the newest and ignores the rest.
 */
export async function flush(): Promise<void> {
  const orderId = await activeOrderId();
  if (!orderId) return;

  const queue = await readQueue();
  if (queue.length === 0) return;

  const ok = await postPositions(orderId, queue);
  if (ok) await writeQueue([]);
}

/** Records a fix, sending immediately and queueing it if that fails. */
export async function record(fix: Fix): Promise<void> {
  const queue = await readQueue();
  queue.push(fix);
  await writeQueue(queue);
  await flush();
}

// The task runs outside React entirely — the OS wakes it, often with no UI
// mounted at all — so it must not touch component state.
TaskManager.defineTask(TRACK_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (!locations?.length) return;

  for (const loc of locations) {
    await record({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      // The time the fix was taken, not the time it reaches us. A position
      // queued through a tunnel must not make a stale map look live.
      at: loc.timestamp || Date.now(),
    });
  }
});

export interface StartResult {
  ok: boolean;
  /** Something the rider can act on, in their language. */
  problem?: "denied" | "denied-background" | "services-off" | "unknown";
}

/**
 * Starts tracking for one order.
 *
 * Permission is asked in two steps because that is how both platforms want it
 * and how a person can actually understand it: foreground first ("while using
 * the app"), then background ("all the time"). Asking for the second one cold
 * gets refused far more often.
 */
export async function startTracking(orderId: string): Promise<StartResult> {
  const enabled = await Location.hasServicesEnabledAsync().catch(() => false);
  if (!enabled) return { ok: false, problem: "services-off" };

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") return { ok: false, problem: "denied" };

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted") {
    // Not fatal. Foreground-only still beats nothing, and the job screen keeps
    // the phone awake, so a rider who refuses "always" is degraded rather than
    // broken. The screen tells them what they are losing.
    await AsyncStorage.setItem(ACTIVE_KEY, orderId);
    return { ok: true, problem: "denied-background" };
  }

  await AsyncStorage.setItem(ACTIVE_KEY, orderId);

  const already = await TaskManager.isTaskRegisteredAsync(TRACK_TASK).catch(() => false);
  if (already) return { ok: true };

  try {
    await Location.startLocationUpdatesAsync(TRACK_TASK, {
      accuracy: Location.Accuracy.Balanced,
      // A motorbike covers 50 m in a couple of seconds; the customer's map is
      // useless with less resolution and wasteful with much more.
      distanceInterval: 50,
      timeInterval: 10_000,
      // Batches while stationary rather than waking the radio every ten seconds
      // at a red light.
      deferredUpdatesInterval: 30_000,
      deferredUpdatesDistance: 100,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Urban Night Lift — delivery in progress",
        notificationBody: "Your customer can see you're on the way. This stops when you deliver.",
        notificationColor: "#d4af37",
        killServiceOnDestroy: false,
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, problem: "unknown" };
  }
}

/**
 * Stops tracking, flushing anything still queued first.
 *
 * Called on delivery, on sign-out, and whenever the app finds no active order —
 * three doors, because the one thing that must never happen is a rider being
 * tracked after their job is done.
 */
export async function stopTracking(): Promise<void> {
  await flush().catch(() => {});
  await AsyncStorage.removeItem(ACTIVE_KEY).catch(() => {});
  try {
    if (await TaskManager.isTaskRegisteredAsync(TRACK_TASK)) {
      await Location.stopLocationUpdatesAsync(TRACK_TASK);
    }
  } catch {
    // Already stopped, or the task never registered. Either is fine.
  }
}

export async function isTracking(): Promise<boolean> {
  return (await activeOrderId()) != null;
}
