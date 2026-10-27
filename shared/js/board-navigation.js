// Pan and zoom a finite board without changing its logical cell coordinates.
// Magnifier: Lucide search (ISC), see snake-game/LUCIDE-LICENSE.
export function createBoardNavigation({ viewport, stage, host, geometry, canExplore, onSelect, onNavigate, resetZoomOnSelect = true }) {
  const controls = document.createElement('div');
  controls.className = 'board-navigation'; controls.hidden = true;
  controls.innerHTML = `<button class="board-zoom-toggle" type="button" aria-label="Board zoom" aria-expanded="false" aria-controls="board-zoom-panel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg></button><div id="board-zoom-panel" class="board-zoom-panel" hidden><input class="board-zoom-slider" aria-label="Board zoom" type="range" min="0.3" max="1.5" step="0.01" value="1"/><output>100%</output></div>`;
  host.append(controls);
  const toggle = controls.querySelector('button'), panel = controls.querySelector('.board-zoom-panel');
  const slider = controls.querySelector('input'), output = controls.querySelector('output');
  const bars = ['horizontal', 'vertical'].map(axis => {
    const bar = document.createElement('div');
    bar.className = `board-scrollbar board-scrollbar-${axis}`;
    bar.innerHTML = '<input type="range" min="0" max="1000" step="1" value="0" />';
    const input = bar.firstElementChild;
    input.setAttribute('aria-label', `Board ${axis} position`);
    input.addEventListener('input', () => {
      onNavigate();
      const maximum = axis === 'horizontal' ? viewport.scrollWidth - viewport.clientWidth : viewport.scrollHeight - viewport.clientHeight;
      viewport[axis === 'horizontal' ? 'scrollLeft' : 'scrollTop'] = maximum * Number(input.value) / 1000;
    });
    host.append(bar); return { bar, input, axis };
  });
  let zoom = 1, minimum = .3, revision = 0, restoring = false;
  const pointers = new Map();
  let gesture = null;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function anchorAt(x, y) {
    const r = stage.getBoundingClientRect();
    return { x: (x - r.left) / r.width, y: (y - r.top) / r.height };
  }
  function center() {
    const r = viewport.getBoundingClientRect();
    return { x: r.left + viewport.clientWidth / 2, y: r.top + viewport.clientHeight / 2 };
  }
  function update() {
    const enabled = canExplore();
    controls.hidden = !enabled;
    if (!enabled) { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
    for (const { bar, input, axis } of bars) {
      const horizontal = axis === 'horizontal';
      const visible = horizontal ? viewport.clientWidth : viewport.clientHeight;
      const total = horizontal ? viewport.scrollWidth : viewport.scrollHeight;
      const position = horizontal ? viewport.scrollLeft : viewport.scrollTop;
      bar.hidden = !enabled || total <= visible + 1;
      input.value = total <= visible ? 0 : position / (total - visible) * 1000;
      input.style.setProperty('--thumb-size', `${Math.max(24, (visible - 24) * visible / total)}px`);
      input.setAttribute('aria-valuetext', `${Math.round(total <= visible ? 0 : position / (total - visible) * 100)}%`);
    }
    slider.value = zoom; output.value = `${Math.round(zoom * 100)}%`;
  }
  function layout() {
    const { width, height } = geometry();
    const style = getComputedStyle(viewport);
    const availableWidth = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availableHeight = viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    minimum = Math.min(1, availableWidth / width, availableHeight / height);
    slider.min = minimum.toFixed(4);
    zoom = clamp(zoom, minimum, 1.5);
    stage.style.setProperty('--board-width', `${width * zoom}px`);
    stage.style.setProperty('--board-height', `${height * zoom}px`);
    update();
  }
  function applyZoom(value, point = center(), anchor = anchorAt(point.x, point.y)) {
    zoom = clamp(value, minimum, 1.5); layout();
    const r = stage.getBoundingClientRect();
    viewport.scrollLeft += r.left + anchor.x * r.width - point.x;
    viewport.scrollTop += r.top + anchor.y * r.height - point.y;
    update();
  }
  async function select(index) {
    if (restoring || !canExplore()) return;
    const cell = stage.querySelector(`[data-index="${index}"]`);
    if (!cell) return;
    if (resetZoomOnSelect && Math.abs(zoom - 1) > .005) {
      onNavigate(); panel.hidden = true; toggle.setAttribute('aria-expanded', 'false');
      const r = cell.getBoundingClientRect(), v = viewport.getBoundingClientRect();
      const anchor = anchorAt(r.left + r.width / 2, r.top + r.height / 2);
      const from = zoom, start = performance.now(), token = ++revision;
      const point = { x: clamp(r.left + r.width / 2, v.left + 35, v.right - 35), y: clamp(r.top + r.height / 2, v.top + 35, v.bottom - 35) };
      restoring = true;
      await new Promise(resolve => {
        function tick(now) {
          if (token !== revision) { resolve(); return; }
          const progress = reduced() ? 1 : Math.min(1, (now - start) / 240);
          applyZoom(from + (1 - from) * (1 - (1 - progress) ** 3), point, anchor);
          if (progress < 1) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (token !== revision) return;
      restoring = false;
    }
    onSelect(index);
  }
  function cancelAnimation() { revision++; restoring = false; }
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) slider.focus({ preventScroll: true });
  });
  slider.addEventListener('input', () => { cancelAnimation(); onNavigate(); applyZoom(Number(slider.value)); });
  viewport.addEventListener('wheel', event => {
    if (!(event.ctrlKey || event.metaKey) || !canExplore() || !event.deltaY) return;
    // Modified wheel gestures zoom this board; ordinary scrolling stays native.
    event.preventDefault(); cancelAnimation(); onNavigate();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    const delta = clamp(event.deltaY * unit, -300, 300);
    applyZoom(zoom * Math.exp(-delta * .002), { x: event.clientX, y: event.clientY });
  }, { passive: false });
  document.addEventListener('pointerdown', event => {
    if (!controls.contains(event.target)) { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  });
  controls.addEventListener('keydown', event => {
    if (event.key === 'Escape') { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus({ preventScroll: true }); }
  });
  function rebase() {
    const list = [...pointers.values()];
    if (list.length >= 2) {
      const [a, b] = list, x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      gesture = { pinch: true, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom, anchor: anchorAt(x, y), moved: true };
    } else if (list.length) {
      const p = list[0];
      gesture = { x: p.x, y: p.y, left: viewport.scrollLeft, top: viewport.scrollTop, index: p.index, moved: true };
    } else gesture = null;
  }
  viewport.addEventListener('pointerdown', event => {
    if (!canExplore() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    cancelAnimation();
    const cell = event.target.closest('[data-index]');
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, index: cell ? Number(cell.dataset.index) : null });
    viewport.setPointerCapture(event.pointerId);
    if (pointers.size === 1) {
      gesture = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, index: cell ? Number(cell.dataset.index) : null, moved: false };
    } else { onNavigate(); rebase(); }
    event.preventDefault();
  });
  viewport.addEventListener('pointermove', event => {
    const p = pointers.get(event.pointerId);
    if (!p || !gesture) return;
    p.x = event.clientX; p.y = event.clientY;
    if (gesture.pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      applyZoom(gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance,
        { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, gesture.anchor);
    } else {
      const dx = p.x - gesture.x, dy = p.y - gesture.y;
      if (!gesture.moved && Math.hypot(dx, dy) > 7) { gesture.moved = true; onNavigate(); }
      if (gesture.moved) {
        viewport.classList.add('is-dragging'); viewport.scrollLeft = gesture.left - dx; viewport.scrollTop = gesture.top - dy; update();
      }
    }
  });
  function end(event) {
    if (!pointers.has(event.pointerId)) return;
    const index = gesture && !gesture.moved && !gesture.pinch && event.type === 'pointerup' ? gesture.index : null;
    pointers.delete(event.pointerId);
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    viewport.classList.remove('is-dragging'); rebase();
    if (index !== null) void select(index);
  }
  viewport.addEventListener('pointerup', end);
  viewport.addEventListener('pointercancel', end);
  viewport.addEventListener('lostpointercapture', end);
  viewport.addEventListener('scroll', () => { if (!restoring) onNavigate(); update(); }, { passive: true });
  new ResizeObserver(layout).observe(viewport);
  return { layout, update, select, reset() { cancelAnimation(); zoom = 1; pointers.clear(); gesture = null; layout(); viewport.scrollTo({ left: 0, top: 0, behavior: 'instant' }); } };
}
