import './theme-button.js';
import { createTheme } from './theme.js';
import { createLeaveGuard } from './leave-guard.js';


function createLeaveDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'leave-dialog';
  dialog.setAttribute('aria-labelledby', 'leave-title');
  dialog.setAttribute('aria-describedby', 'leave-detail');
  dialog.innerHTML = `<button type="button" class="leave-close" aria-label="Close">×</button><h2 id="leave-title">Leave this game?</h2><p id="leave-detail">Your current progress will be lost.</p><div class="leave-actions"><button type="button" data-stay>Keep playing</button><button type="button" class="secondary" data-leave>Leave game</button></div>`;
  document.body.append(dialog);
  let finish;
  function close(value = false) {
    if (!finish) return;
    const resolve = finish; finish = null;
    dialog.close(); resolve(value);
  }
  dialog.querySelector('[data-stay]').addEventListener('click', () => close());
  dialog.querySelector('[data-leave]').addEventListener('click', () => close(true));
  dialog.querySelector('.leave-close').addEventListener('click', () => close());
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => {
    const r = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right ||
        event.clientY < r.top || event.clientY > r.bottom)) close();
  });
  // Keep game shortcuts from acting through the modal; native Tab/Enter still work.
  const blockGameKeys = event => {
    if (!dialog.open) return;
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  };
  dialog.addEventListener('keydown', blockGameKeys);
  return {
    confirm: () => new Promise(resolve => {
      finish = resolve;
      dialog.showModal();
      dialog.querySelector('[data-stay]').focus();
    }),
    isOpen: () => dialog.open,
    dispose() { close(); dialog.remove(); },
  };
}

export function createPageShell({ header = document.querySelector('[data-page-header]'),
  homeUrl, ready = true, isActive = () => false, onPrompt, legacyStorage, onThemeChange } = {}) {
  const themeButton = header.querySelector('#theme') || globalThis.createCollectionThemeButton();
  header.append(themeButton);
  const theme = createTheme({ button: themeButton, legacyStorage, onChange: onThemeChange });
  theme.apply();
  if (!homeUrl) return { theme, refresh() {}, isConfirming: () => false };

  const home = document.createElement('a');
  home.className = 'page-home icon-button'; home.href = homeUrl;
  home.setAttribute('aria-label', 'Back to Homepage'); home.title = 'Back to Homepage';
  // Lucide house (ISC); see snake-game/LUCIDE-LICENSE.
  home.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1z"/></svg>';
  // Compact title-row controls share one appearance and reserve their width.
  const nav = document.createElement('nav'); nav.className = 'page-navigation';
  nav.setAttribute('aria-label', 'Collection'); nav.append(home, themeButton); header.append(nav);
  nav.inert = true;
  let revealPromise;
  function reveal() {
    return revealPromise ||= (async () => {
      if (document.readyState !== 'complete') await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
      await document.fonts?.ready;
      await new Promise(resolve => requestAnimationFrame(resolve));
      nav.inert = false; nav.classList.add('is-ready');
      // Reveal the initialized scene and its controls together, without animation.
      document.body.classList.remove('page-entering');
    })();
  }
  if (ready) void reveal();
  const modal = createLeaveDialog();
  const guard = createLeaveGuard({ isActive, confirmLeave: modal.confirm, onPrompt,
    navigate: url => window.location.assign(url) });
  function followLink(event) {
    const link = event.target.closest?.('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey ||
        event.metaKey || event.shiftKey || event.altKey || link.hasAttribute('download') ||
        link.target && link.target !== '_self') return;
    const url = new URL(link.href, location.href);
    if (!['http:', 'https:'].includes(url.protocol) ||
        url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return;
    if (!isActive()) return;
    event.preventDefault(); void guard.request(url.href);
  }
  document.addEventListener('click', followLink);
  guard.refresh();
  return { theme, reveal, refresh: guard.refresh, isConfirming: modal.isOpen,
    dispose() { guard.dispose(); theme.dispose(); modal.dispose(); nav.remove();
      themeButton.remove(); document.removeEventListener('click', followLink); } };
}
