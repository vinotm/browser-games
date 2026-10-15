// Pointer gestures only decide a direction. Each game owns its movement rules.
export function bindSwipe(element, onDirection, { threshold = 12 } = {}) {
  let start = null;
  const down = event => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (start) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId, fired: false };
    element.setPointerCapture(event.pointerId);
  };
  const cancel = event => { if (start?.id === event.pointerId) start = null; };
  const move = event => {
    if (!start || start.id !== event.pointerId || start.fired) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
    start.fired = true;
    onDirection(Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };
  const up = event => { move(event); cancel(event); };
  const handlers = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: cancel, lostpointercapture: cancel };
  for (const [name, handler] of Object.entries(handlers)) element.addEventListener(name, handler);
  return () => {
    start = null;
    for (const [name, handler] of Object.entries(handlers)) element.removeEventListener(name, handler);
  };
}

export function bindVisibilityPause(onPause) {
  const handler = () => { if (document.hidden) onPause(); };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

// Delegated buttons can be reused independently of swipe controls.
export function bindDirectionButtons(element, onDirection) {
  const pressed = new Map();
  const findButton = event => {
    const button = event.target.closest?.('button[data-direction]');
    return button && element.contains(button) && !button.disabled ? button : null;
  };
  const press = event => {
    const button = findButton(event);
    if (!button || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pressed.set(event.pointerId, button);
    button.classList.add('is-pressed');
    button.setPointerCapture(event.pointerId);
    onDirection(button.dataset.direction);
  };
  const release = event => {
    const button = pressed.get(event.pointerId);
    pressed.delete(event.pointerId);
    if (button && ![...pressed.values()].includes(button)) button.classList.remove('is-pressed');
  };
  const handler = event => {
    // Keyboard/assistive activation has no pointer press. Ignore the synthetic
    // click after pointer release so it cannot queue a second, stale turn.
    if (event.detail !== 0) return;
    const button = findButton(event);
    if (button) onDirection(button.dataset.direction);
  };
  const handlers = { click: handler, pointerdown: press, pointerup: release,
    pointercancel: release, lostpointercapture: release };
  for (const [name, handler] of Object.entries(handlers)) element.addEventListener(name, handler);
  return () => {
    for (const button of pressed.values()) button.classList.remove('is-pressed');
    pressed.clear();
    for (const [name, handler] of Object.entries(handlers)) element.removeEventListener(name, handler);
  };
}

export function isEditableTarget(target) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
}
