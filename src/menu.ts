import { catalog } from './catalog';
import { esc } from './core/render';
import { index } from './search';

/** Built, in progress or soon: decided once, in the search index, so the menu and the search always agree. */
const statusOf = new Map(index.map((e) => [e.id, e.status]));

/** Fills the header's Protocols dropdown from the catalog. Unbuilt protocols are listed but not linked. */
export function mountMenu(menu: HTMLDetailsElement) {
  const panel = menu.querySelector<HTMLElement>('.menu-panel')!;
  const guide = `<div class="menu-group"><h3>Start here</h3><ul><li><a href="?p=basics" data-nav>How protocols work</a></li></ul></div>`;
  panel.innerHTML =
    guide +
    catalog
      .map((cat) => {
        const items = cat.entries.map((e) => {
          const status = statusOf.get(e.id);
          const title = `title="${esc(e.blurb)}"`;
          if (status === 'live') return `<li><a href="?p=${e.id}" data-nav ${title}>${e.name}</a></li>`;
          if (status === 'wip') return `<li><a class="wip" href="?p=${e.id}" data-nav ${title}>${e.name}</a></li>`;
          return `<li class="soon" ${title}>${e.name}</li>`;
        });
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
