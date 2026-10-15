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

export function formatDuration(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
