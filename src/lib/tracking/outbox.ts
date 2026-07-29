/**
 * Positions that could not be sent, kept until they can be.
 *
 * A rider crosses a dead-signal patch — a stairwell, an underpass, one of the
 * many places in Yaoundé where the network simply goes — and every position
 * recorded in that minute used to be dropped on the floor. The customer's map
 * froze and then jumped, which reads as "the tracking is broken" even though
 * the rider was moving normally the whole time.
 *
 * Kept in localStorage rather than memory so a backgrounded tab that gets
 * killed by the OS does not lose the trail either. Bounded, because an old
 * position is worth less than a recent one and a queue that grows without limit
 * is its own bug.
 */

export interface QueuedFix {
  lat: number;
  lng: number;
  at: number;
}

const KEY = "unl_rider_outbox";
/** Beyond this the oldest are dropped — a ten-minute-old point helps nobody. */
const MAX_QUEUED = 40;

function read(): QueuedFix[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedFix[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedFix[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX_QUEUED)));
  } catch {
    // Storage full or blocked: losing the queue is survivable, throwing is not.
  }
}

export function queueFix(fix: QueuedFix): void {
  write([...read(), fix]);
}

export function queuedCount(): number {
  return read().length;
}

/**
 * Send everything waiting, oldest first, and keep whatever still fails.
 *
 * Only the newest fix actually matters to the map, but the whole trail matters
 * to a delivery dispute, so all of it is sent.
 */
export async function flushOutbox(
  send: (fix: QueuedFix) => Promise<boolean>
): Promise<number> {
  const pending = read();
  if (pending.length === 0) return 0;

  const stillFailing: QueuedFix[] = [];
  let sent = 0;
  for (const fix of pending) {
    // Once one send fails the network is down; stop rather than hammering it.
    if (stillFailing.length > 0) {
      stillFailing.push(fix);
      continue;
    }
    const ok = await send(fix);
    if (ok) sent += 1;
    else stillFailing.push(fix);
  }
  write(stillFailing);
  return sent;
}

export function clearOutbox(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do; the queue is bounded and will age out.
  }
}
