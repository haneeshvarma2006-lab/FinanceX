/**
 * The one place the wall clock is read.
 *
 * Reading a clock inside a React component is impure: two parts of one render
 * can disagree about "now", and in a client component the server and the
 * hydrating client will disagree too — a hydration mismatch that shows up as
 * a task flickering between overdue and not.
 *
 * Centralising it here means a page reads the time once, deliberately, and
 * passes that value down; it also gives tests a single seam to control.
 */
export function currentInstant(): number {
  return Date.now();
}

export function currentDate(): Date {
  return new Date(currentInstant());
}
