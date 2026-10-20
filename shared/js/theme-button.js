// Synchronous homepage rendering and module-driven games use the same icon source.
(() => {
// Sun icon: Lucide (ISC); see snake-game/LUCIDE-LICENSE. Crescent is custom.
const themeIcons = `<svg class="sun-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg><svg class="moon-icon" aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" transform="rotate(-35 12 12)" d="M14 3.225A9 9 0 1 0 14 20.775A9 9 0 0 1 14 3.225Z"/></svg>`;

  globalThis.createCollectionThemeButton = () => {
    const button = document.createElement('button');
    button.id = 'theme'; button.type = 'button'; button.className = 'icon-button';
    button.innerHTML = themeIcons;
    const label = document.documentElement.dataset.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    button.setAttribute('aria-label', label); button.title = label;
    return button;
  };
  const header = document.querySelector('[data-immediate-theme]');
  if (header && !header.querySelector('#theme')) header.append(globalThis.createCollectionThemeButton());
})();
