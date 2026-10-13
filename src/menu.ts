import { catalog } from './catalog';
import { esc } from './core/render';
import { protocols } from './protocols';

const live = new Set(protocols.map((p) => p.id));

/** Fills the header's Protocols dropdown from the catalog. Unbuilt protocols are listed but not linked. */
export function mountMenu(menu: HTMLDetailsElement) {
  const panel = menu.querySelector('.menu-panel')!;
  const guide = `<div class="menu-group"><h3>Start here</h3><ul><li><a href="?p=basics" data-nav>How protocols work</a></li></ul></div>`;
  panel.innerHTML = guide + catalog
    .map((cat) => {
      const items = cat.entries.map((e) =>
        live.has(e.id)
          ? `<li><a href="?p=${e.id}" data-nav title="${esc(e.blurb)}">${e.name}</a></li>`
          : `<li class="soon" title="${esc(e.blurb)}">${e.name}</li>`,
      );
      return `<div class="menu-group"><h3>${cat.name}</h3><ul>${items.join('')}</ul></div>`;
    })
    .join('');

  // Close on outside click, Escape, or picking a protocol.
  document.addEventListener('click', (e) => {
    if (!menu.open) return;
    const t = e.target as Element;
    if (!menu.contains(t) || t.closest('a')) menu.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary')!.focus();
    }
  });

  return {
    /** Marks the current protocol in the menu. */
    setCurrent(id: string | null) {
      panel.querySelectorAll('a').forEach((a) => {
        const here = new URL(a.href).searchParams.get('p') === id;
        a.toggleAttribute('aria-current', here);
      });
    },
  };
}
