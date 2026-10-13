/** Light by default; the toggle flips to dark and remembers the choice in this browser. */
export function mountThemeToggle(btn: HTMLButtonElement) {
  const root = document.documentElement;
  const sync = () => {
    const dark = root.dataset.theme === 'dark';
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    btn.title = dark ? 'Light theme' : 'Dark theme';
  };
  btn.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* private mode: the choice just won't persist */ }
    sync();
  });
  sync();
}
