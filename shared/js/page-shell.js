import { createTheme } from './theme.js';
import { createLeaveGuard } from './leave-guard.js';

// Sun icon: Lucide (ISC); see snake-game/LUCIDE-LICENSE. Crescent is custom.
const themeIcons = `<svg class="sun-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg><svg class="moon-icon" aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" transform="rotate(-35 12 12)" d="M14 3.225A9 9 0 1 0 14 20.775A9 9 0 0 1 14 3.225Z"/></svg>`;

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
  homeUrl, isActive = () => false, onPrompt, legacyStorage, onThemeChange } = {}) {
  const themeButton = document.createElement('button');
  themeButton.id = 'theme'; themeButton.type = 'button'; themeButton.className = 'icon-button';
  themeButton.innerHTML = themeIcons;
  header.append(themeButton);
  const theme = createTheme({ button: themeButton, legacyStorage, onChange: onThemeChange });
  theme.apply();
  if (!homeUrl) return { theme, refresh() {}, isConfirming: () => false };

  const home = document.createElement('a');
  home.className = 'page-home'; home.href = homeUrl; home.textContent = 'Back to Homepage';
  // A short separate line keeps the title and game controls centered on small screens.
  const nav = document.createElement('nav'); nav.className = 'page-navigation';
  nav.setAttribute('aria-label', 'Collection'); nav.append(home); header.before(nav);
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
  return { theme, refresh: guard.refresh, isConfirming: modal.isOpen,
    dispose() { guard.dispose(); theme.dispose(); modal.dispose(); nav.remove();
      themeButton.remove(); document.removeEventListener('click', followLink); } };
}
