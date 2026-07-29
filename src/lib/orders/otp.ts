import { customAlphabet } from "nanoid";

/**
 * The delivery code the customer reads out to the rider at the door.
 *
 * Four digits, because it gets spoken aloud in a dark street and typed on a
 * phone with one hand — length here would cost more in failed handovers than it
 * buys in secrecy. What actually protects it is when it exists: the code is
 * created at the moment a rider is dispatched, not when the order is placed, so
 * it is only in the world while there is something for it to protect.
 *
 * It is never returned by a public endpoint. Confirmation compares server-side
 * and answers yes or no.
 */
const otpId = customAlphabet("0123456789", 4);

export function generateOtp(): string {
  return otpId();
}
