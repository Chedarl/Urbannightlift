/**
 * "Tonight" = the current operating night. A night that runs 8PM–midnight can
 * be viewed slightly after midnight too, so we anchor the window to the most
 * recent operating start. For simplicity and the MVP's low volume, "tonight"
 * is the window from today's operatingStartHour (or yesterday's if we're in the
 * small-hours tail) up to now.
 */
export function tonightWindow(startHour = 20): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(startHour, 0, 0, 0);
  // If it's before the start hour (e.g. 00:30), the operating night began
  // yesterday evening.
  if (now.getHours() < startHour) {
    start.setDate(start.getDate() - 1);
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(startHour, 0, 0, 0);
  return { start, end };
}
