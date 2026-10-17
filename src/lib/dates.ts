/**
 * Calendar days for people, not databases: `2026-10-17` reads as "Today",
 * "Yesterday", or "17 Oct" — with the year only when it is not this one.
 * `today` is passed in (already in the user's timezone) so nothing here
 * reads a clock.
 */
export function shortDay(isoDay: string, today: string): string {
  if (isoDay === today) return 'Today';
  if (isoDay === previousDay(today)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: isoDay.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
    // Noon UTC keeps the calendar date stable whatever the formatter's zone.
    timeZone: 'UTC',
  }).format(new Date(`${isoDay}T12:00:00Z`));
}

function previousDay(isoDay: string): string {
  const date = new Date(`${isoDay}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
