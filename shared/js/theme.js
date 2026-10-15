import { createStorage } from './storage.js?v=beta-public-1';

// Shared collection preference, with optional migration from a game's old key.
export function createTheme({ button, onChange = () => {}, legacyStorage } = {}) {
  const storage = createStorage('browser-games');
  const system = matchMedia('(prefers-color-scheme: dark)');
  const saved = storage.get('theme') ?? legacyStorage?.get('theme');
  let dark = saved === 'dark' || (saved !== 'light' && system.matches);
  function apply() {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    button?.setAttribute('aria-label', label);
    if (button) button.title = label;
    onChange(dark);
  }
  function toggle() {
    dark = !dark;
    storage.set('theme', dark ? 'dark' : 'light');
    apply();
  }
  if (saved === 'dark' || saved === 'light') storage.set('theme', saved);
  button?.addEventListener('click', toggle);
  return { apply, toggle, dispose() { button?.removeEventListener('click', toggle); } };
}
