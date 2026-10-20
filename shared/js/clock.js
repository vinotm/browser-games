// Monotonic active-play time; pause/resume never includes paused time.
export function createClock(now = () => performance.now()) {
  let elapsed = 0;
  let started = null;
  const value = (time = now()) => elapsed + (started === null ? 0 : Math.max(0, time - started));
  return {
    value,
    start(time = now()) { if (started === null) started = time; return time; },
    pause(time = now()) { elapsed = value(time); started = null; },
    reset() { elapsed = 0; started = null; },
  };
}

// Elapsed time, not a time of day: hours never wrap at 24.
export function formatDuration(milliseconds, { padMinutes = false } = {}) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const minuteLabel = String(minutes).padStart(hours || padMinutes ? 2 : 1, '0');
  return `${hours ? `${hours}:` : ''}${minuteLabel}:${String(seconds % 60).padStart(2, '0')}`;
}
