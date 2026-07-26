/**
 * "Tonight" = the current operating night, in Yaoundé time.
 *
 * This has to be computed in Africa/Douala rather than the server's own
 * timezone. Vercel runs in UTC and Cameroon is UTC+1, so anchoring the window
 * with `setHours()` shifted the whole night an hour later than the business
 * actually opens, and every order placed in that gap vanished from the admin
 * and rider dashboards while sitting perfectly happily in the database. There
 * is no more effective way to lose an order than to hide it from the person
 * whose job is to dispatch it.
 *
 * The window runs from the most recent operating start to the same hour the
 * next day, so a night that spills past midnight still reads as one night.
 */

/** Cameroon does not observe daylight saving, so the offset is a constant +1. */
const YAOUNDE_UTC_OFFSET_HOURS = 1;

/** The wall-clock hour in Yaoundé right now. */
export function yaoundeHour(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Africa/Douala",
    }).format(now)
  );
}

export function tonightWindow(startHour = 18, now: Date = new Date()): { start: Date; end: Date } {
  // Shift into Yaoundé wall-clock so the date arithmetic happens in the
  // business's own day, then shift back to real UTC instants for the query.
  const wall = new Date(now.getTime() + YAOUNDE_UTC_OFFSET_HOURS * 3_600_000);

  const startWall = new Date(wall);
  startWall.setUTCHours(startHour, 0, 0, 0);
  // Before opening time (e.g. 00:30) the operating night began yesterday evening.
  if (wall.getUTCHours() < startHour) {
    startWall.setUTCDate(startWall.getUTCDate() - 1);
  }

  const endWall = new Date(startWall);
  endWall.setUTCDate(endWall.getUTCDate() + 1);

  const toInstant = (d: Date) => new Date(d.getTime() - YAOUNDE_UTC_OFFSET_HOURS * 3_600_000);
  return { start: toInstant(startWall), end: toInstant(endWall) };
}
