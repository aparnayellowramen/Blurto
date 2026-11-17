// Clock-based phase timers (FR-6, FR-7, FR-11).
// A timer stores when it ends, not how many ticks are left, so it stays
// accurate when the phone locks or the tab is throttled in the background.
// Timers are plain objects so they can be saved and restored as JSON.
//   { duration, endsAt, paused }   paused = ms left while paused, else null

export const start = (duration, now) => ({ duration, endsAt: now + duration, paused: null });

export const remaining = (t, now) => (t.paused != null ? t.paused : Math.max(0, t.endsAt - now));

export const pause = (t, now) => (t.paused != null ? t : { ...t, paused: remaining(t, now) });

export const resume = (t, now) => (t.paused == null ? t : { ...t, endsAt: now + t.paused, paused: null });

export const isDone = (t, now) => t.paused == null && remaining(t, now) <= 0;

/** 1:59.2 shows as "2:00", so the display reaches 0:00 exactly when time is up. */
export function format(ms) {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
