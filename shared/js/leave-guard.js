// One navigation policy for every game. Games supply state, never browser UI.
export function createLeaveGuard({ isActive, confirmLeave, navigate,
  onPrompt = () => {}, target = globalThis.window } = {}) {
  let listening = false, pending = false, approved = false;
  function beforeUnload(event) {
    if (approved || !isActive()) return;
    event.preventDefault();
    event.returnValue = true;
  }
  function refresh() {
    const needed = !approved && Boolean(isActive());
    if (needed === listening) return;
    listening = needed;
    target[needed ? 'addEventListener' : 'removeEventListener']('beforeunload', beforeUnload);
  }
  async function request(url) {
    if (pending) return false;
    if (!isActive()) { navigate(url); return true; }
    pending = true;
    let restore;
    try {
      restore = onPrompt();
      if (!await confirmLeave()) return false;
      approved = true;
      refresh(); // Avoid a second, native prompt after the custom confirmation.
      try { navigate(url); }
      catch (error) { approved = false; refresh(); throw error; }
      return true;
    } finally {
      pending = false;
      if (!approved) restore?.();
    }
  }
  function restored() { approved = false; refresh(); }
  target.addEventListener('pageshow', restored);
  return { refresh, request,
    dispose() {
      target.removeEventListener('beforeunload', beforeUnload);
      target.removeEventListener('pageshow', restored);
    } };
}
