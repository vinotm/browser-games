// Extend thinking time without keeping an unattended device awake indefinitely.
export function createScreenAwake({ wakeLock = globalThis.navigator?.wakeLock,
  clock = () => performance.now(), schedule = setTimeout, cancel = clearTimeout,
  idleMs = 5 * 60 * 1000 } = {}) {
  let active = false, visible = true, deadline = 0, lock = null, pending = false, timer;
  const wanted = () => active && visible && clock() < deadline;
  function release() { const previous = lock; lock = null; previous?.release().catch(() => {}); }
  async function sync() {
    if (!wanted()) { release(); return; }
    if (!wakeLock || lock || pending) return;
    pending = true;
    try {
      const acquired = await wakeLock.request('screen');
      if (!wanted()) { await acquired.release(); return; }
      lock = acquired;
      acquired.addEventListener('release', () => { if (lock === acquired) lock = null; });
    } catch { /* Unsupported devices and battery policies must not affect the game. */ }
    finally { pending = false; }
  }
  function activity() {
    if (!active) return;
    deadline = clock() + idleMs; cancel(timer);
    timer = schedule(() => { void sync(); }, idleMs);
    void sync();
  }
  return {
    setActive(value) {
      if (active === Boolean(value)) return;
      active = Boolean(value);
      if (active) activity(); else { cancel(timer); release(); }
    },
    activity,
    setVisible(value) { visible = Boolean(value); void sync(); },
  };
}
