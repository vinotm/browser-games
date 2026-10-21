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

// Animate a floating panel without moving surrounding content. Closing makes it
// inert immediately; rapid toggles continue from the current visual position.
export function createPopupMotion(element) {
  let open = false, animation, revision = 0;
  element.hidden = true;
  element.inert = true;
  async function setOpen(next) {
    if (next === open) return false;
    const current = ++revision;
    const from = element.hidden ? { opacity: 0, transform: 'translateY(-6px) scaleY(.96)' }
      : { opacity: getComputedStyle(element).opacity, transform: getComputedStyle(element).transform };
    animation?.cancel();
    open = next;
    element.hidden = false;
    element.inert = !next;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animation = element.animate([from, next ? { opacity: 1, transform: 'none' }
        : { opacity: 0, transform: 'translateY(-6px) scaleY(.96)' }],
      { duration: next ? 180 : 140, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
      try { await animation.finished; } catch { /* Superseded by another toggle. */ }
    }
    if (current !== revision) return false;
    element.hidden = !next;
    animation?.cancel();
    animation = null;
    return !next;
  }
  return { show: () => setOpen(true), hide: () => setOpen(false), isOpen: () => open };
}
