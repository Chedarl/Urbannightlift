import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeLoose } from "@/lib/locations/normalize";

/**
 * The address book the operation writes for itself.
 *
 * Addresses in Yaoundé are landmarks, not postal lines — "behind the Total
 * station at Rond-Point Express, blue gate". Across this market address errors
 * cause roughly 45% of failed first attempts, and every failure burns a rider
 * trip we have already paid for.
 *
 * Guessing from text gets us close. A completed delivery tells us exactly. So
 * when a rider successfully drops off, we write their GPS back against the
 * address text the customer typed, and the next order to that address starts
 * from a known point rather than a guess.
 *
 * Two properties make this worth having:
 *  - it costs nothing — no data purchase, no per-lookup fee;
 *  - it compounds — accuracy improves with every delivery, so the operation is
 *    measurably better in six months than it is today without anyone doing
 *    anything.
 */

/** A place must be confirmed by this many separate deliveries before we trust it for everyone. */
const GLOBAL_TRUST_THRESHOLD = 3;

/** A GPS fix older than this was taken somewhere else on the trip. */
const MAX_FIX_AGE_MS = 20 * 60 * 1000;

export interface KnownPlace {
  latitude: number;
  longitude: number;
  confirmations: number;
  /** True when this is the customer's own confirmed address rather than a shared one. */
  personal: boolean;
}

/**
 * Looks up an address we have delivered to before. The customer's own history
 * wins over the shared pool: their "home" is theirs, and one confirmed
 * delivery to it is worth more than three strangers' agreement about a similar
 * string.
 */
export async function findVerifiedPlace(
  text: string,
  customerId?: string | null
): Promise<KnownPlace | null> {
  const normalized = normalizeLoose(text);
  if (normalized.length < 3) return null;

  if (customerId) {
    const own = await prisma.verifiedPlace.findUnique({
      where: { customerId_normalizedText: { customerId, normalizedText: normalized } },
    });
    if (own) {
      return {
        latitude: own.latitude,
        longitude: own.longitude,
        confirmations: own.confirmations,
        personal: true,
      };
    }
  }

  const shared = await prisma.verifiedPlace.findFirst({
    where: { customerId: null, normalizedText: normalized, confirmations: { gte: GLOBAL_TRUST_THRESHOLD } },
    orderBy: { confirmations: "desc" },
  });
  if (!shared) return null;

  return {
    latitude: shared.latitude,
    longitude: shared.longitude,
    confirmations: shared.confirmations,
    personal: false,
  };
}

/**
 * Records where a delivery actually landed.
 *
 * Called after a delivery completes, using the rider's last known position.
 * Deliberately conservative: a stale GPS fix is from earlier in the trip and
 * would teach us the wrong place, so it is ignored rather than trusted. A
 * failure here must never affect the delivery — the rider has done their job
 * either way.
 */
export async function recordDeliveredPlace(args: {
  customerId: string;
  deliveryText: string;
  latitude: number | null;
  longitude: number | null;
  fixedAt: Date | null;
  completedAt?: Date;
}): Promise<void> {
  const { customerId, deliveryText, latitude, longitude, fixedAt } = args;
  if (latitude == null || longitude == null || !fixedAt) return;

  const completedAt = args.completedAt ?? new Date();
  if (completedAt.getTime() - fixedAt.getTime() > MAX_FIX_AGE_MS) return;

  const normalizedText = normalizeLoose(deliveryText);
  if (normalizedText.length < 3) return;

  try {
    // The customer's own entry always moves to the latest confirmed position:
    // people move, and the most recent successful delivery is the best truth.
    await prisma.verifiedPlace.upsert({
      where: { customerId_normalizedText: { customerId, normalizedText } },
      create: { customerId, normalizedText, rawText: deliveryText.slice(0, 300), latitude, longitude },
      update: {
        latitude,
        longitude,
        confirmations: { increment: 1 },
        lastConfirmedAt: completedAt,
      },
    });

    // The shared pool only counts agreement; it never moves to a single new
    // fix, so one bad reading cannot drag a well-known landmark off its spot.
    // Prisma can't address a compound unique through a null component, so the
    // shared row is fetched by filter rather than by key.
    const shared = await prisma.verifiedPlace.findFirst({
      where: { customerId: null, normalizedText },
    });
    if (shared) {
      await prisma.verifiedPlace.update({
        where: { id: shared.id },
        data: { confirmations: { increment: 1 }, lastConfirmedAt: completedAt },
      });
    } else {
      await prisma.verifiedPlace.create({
        data: {
          customerId: null,
          normalizedText,
          rawText: deliveryText.slice(0, 300),
          latitude,
          longitude,
        },
      });
    }
  } catch {
    // Learning is a bonus, never a requirement. The delivery already happened.
  }
}
