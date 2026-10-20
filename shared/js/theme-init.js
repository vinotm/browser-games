// Apply the preference before styles paint; the theme module handles controls.
(() => {
  let saved;
  try {
    saved = localStorage.getItem('browser-games-theme');
    const legacy = document.currentScript?.dataset.legacyTheme;
    if (saved === null && legacy) saved = localStorage.getItem(`${legacy}-theme`);
  } catch { /* Storage is optional. */ }
  const dark = saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
