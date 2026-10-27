import { bindSwipe } from './input.js';

// Optional in-board guide. Content belongs to each game; this module owns navigation,
// keyboard handling, dismissal, and board placement. Lucide circle-help (ISC).
export function createTutorial({ host, pages, onOpen = () => {} }) {
  if (!host || !pages?.length) throw new Error('A tutorial needs a board host and pages');
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'page-tutorial icon-button';
  button.title = 'Game guide'; button.setAttribute('aria-label', 'Game guide');
  // Lucide circle frame with a typographic question mark for a continuous glyph.
  button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><text x="12" y="17.2" text-anchor="middle" fill="currentColor" stroke="none" font-family="Arial, sans-serif" font-size="16" font-weight="600">?</text></svg>';
  const dialog = document.createElement('dialog');
  dialog.className = 'game-guide'; dialog.setAttribute('aria-label', 'Game guide');
  dialog.innerHTML = '<div class="guide-chrome"><button type="button" class="guide-close" aria-label="Close guide">×</button></div><div class="guide-content" aria-live="polite"><h2 tabindex="-1"></h2><div class="guide-example"></div><p class="guide-caption"></p></div><footer><button type="button" class="secondary" data-back>Back</button><span class="guide-step" aria-live="polite"></span><button type="button" data-next>Next</button></footer>';
  host.append(dialog);
  let index = 0, restore, returnFocus = false;
  const back = dialog.querySelector('[data-back]'), next = dialog.querySelector('[data-next]');
  function render() {
    const page = pages[index];
    dialog.querySelector('.guide-step').textContent = `${index + 1} / ${pages.length}`;
    dialog.querySelector('h2').textContent = page.title;
    dialog.querySelector('.guide-example').replaceChildren(page.visual());
    dialog.querySelector('.guide-caption').textContent = page.caption;
    back.disabled = index === 0; next.disabled = index === pages.length - 1;
    dialog.querySelector('.guide-content').scrollTop = 0;
  }
  function close() {
    if (!dialog.open) return;
    returnFocus = dialog.contains(document.activeElement);
    dialog.close();
  }
  button.addEventListener('click', () => {
    if (dialog.open) return;
    restore = onOpen(); index = 0; render(); dialog.show();
    dialog.querySelector('h2').focus({ preventScroll: true });
  });
  function step(delta) {
    const target = Math.max(0, Math.min(pages.length - 1, index + delta));
    if (target !== index) { index = target; render(); }
  }
  back.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  const unbindSwipe = bindSwipe(dialog.querySelector('.guide-content'), direction => {
    if (!dialog.open || document.querySelector('dialog:modal')) return;
    if (direction === 'left') step(1);
    if (direction === 'right') step(-1);
  }, { threshold: 40 });
  dialog.querySelector('.guide-close').addEventListener('click', close);
  dialog.addEventListener('close', () => { restore?.(); restore = null;
    if (returnFocus) button.focus({ preventScroll: true }); });
  // This is a board panel, not a page-wide modal. Tab may reach outside controls.
  dialog.addEventListener('keydown', event => event.stopPropagation());
  function guideKey(event) {
    if (!dialog.open || document.querySelector('dialog:modal') || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
    // Other page controls remain usable while a non-modal guide is open.
    if (event.target.closest?.('input, textarea, select, [contenteditable], [role="combobox"], [role="slider"]')) return;
    const key = event.key.toLowerCase();
    const delta = ['arrowleft', 'a'].includes(key) ? -1 : ['arrowright', 'd'].includes(key) ? 1 : 0;
    if (!delta) return;
    event.preventDefault(); event.stopImmediatePropagation(); step(delta);
  }
  document.addEventListener('keydown', guideKey, true);
  return { button, close, isOpen: () => dialog.open,
    dispose() { close(); document.removeEventListener('keydown', guideKey, true); unbindSwipe();
      dialog.remove(); button.remove(); } };

}

// Static, game-owned SVG scenes; never pass player input or report content here.
export function createGuideScene(label, markup) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 320 120'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label); svg.innerHTML = markup;
  return svg;
}
