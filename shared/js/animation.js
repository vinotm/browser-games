// One pending frame at a time; the caller decides when to request another.
export function createFrameScheduler(callback) {
  let pending = null;
  return {
    request() {
      if (pending === null) pending = requestAnimationFrame(time => {
        pending = null;
        callback(time);
      });
    },
    cancel() {
      if (pending !== null) cancelAnimationFrame(pending);
      pending = null;
    },
  };
}
