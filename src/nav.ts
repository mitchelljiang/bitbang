import { bitTopics } from './bits';
import { catalog, type Category } from './catalog';
import { esc } from './core/render';
import { statusOf } from './search';

interface Section {
  id: string;
  name: string;
  /** The tab label on narrow screens. */
  short: string;
  /** One or two sentences for the section's card on the home page. */
  blurb: string;
  /** Pages listed before the categories, such as the protocol guide. */
  lead: { id: string; name: string }[];
  categories: Category[];
  /** Pages to suggest on the home page card, besides the first page. */
  featured: string[];
}

/** The parts of the site. Each has a header tab, a sidebar listing its pages, and previous/next links. */
export const sections: Section[] = [
  {
    id: 'protocols', name: 'Protocols', short: 'Protocols',
    blurb: 'How chips and devices talk to each other over wires, from UART and SPI to USB and PCI Express, with the timing of every edge.',
    lead: [{ id: 'basics', name: 'How protocols work' }], categories: catalog, featured: ['uart', 'spi', 'i2c', 'usb'],
  },
  {
    id: 'bits', name: 'Bit manipulation', short: 'Bits',
    blurb: 'How numbers are stored and changed inside a computer: binary, two’s complement, shifts, masks and floating point.',
    lead: [], categories: bitTopics, featured: ['twos', 'masks', 'float'],
  },
];

export const sectionOf = (id: string) =>
  sections.find((s) => s.lead.some((l) => l.id === id) || s.categories.some((c) => c.entries.some((e) => e.id === id)));

/** The section's pages in reading order, skipping ones without a page yet. Previous and next walk through these. */
export const pagesOf = (s: Section) => [...s.lead, ...s.categories.flatMap((c) => c.entries.filter((e) => statusOf.get(e.id) !== 'soon'))];

function sidebarHtml(s: Section) {
  const lead = s.lead.length
    ? `<div class="side-group"><h3>Start here</h3><ul>${s.lead.map((l) => `<li><a href="?p=${l.id}" data-nav>${esc(l.name)}</a></li>`).join('')}</ul></div>`
    : '';
  return lead + s.categories.map((cat) => {
    const items = cat.entries.map((e) => {
      const status = statusOf.get(e.id);
      const title = `title="${esc(e.blurb)}"`;
      if (status === 'live') return `<li><a href="?p=${e.id}" data-nav ${title}>${esc(e.name)}</a></li>`;
      if (status === 'wip') return `<li><a class="wip" href="?p=${e.id}" data-nav ${title}>${esc(e.name)}<span class="sr">, in progress</span></a></li>`;
      return `<li class="soon" ${title}>${esc(e.name)}</li>`;
    });
    return `<div class="side-group"><h3>${esc(cat.heading ?? cat.name)}</h3><ul>${items.join('')}</ul></div>`;
  }).join('') + (s.categories.some((c) => c.entries.some((e) => statusOf.get(e.id) === 'wip'))
    ? '<p class="side-key" aria-hidden="true"><i></i>In progress</p>' : '');
}

/**
 * The section tabs in the header, the sidebar beside the content, and the previous/next links under it.
 * On narrow screens the sidebar collapses behind a button.
 */
export function mountNav(tabs: HTMLElement, side: HTMLElement, pager: HTMLElement) {
  tabs.innerHTML = sections.map((s) =>
    `<a href="?p=${pagesOf(s)[0].id}" data-nav data-section="${s.id}"><span class="long">${esc(s.name)}</span><span class="short">${esc(s.short)}</span></a>`).join('');
  side.innerHTML = `
    <button class="side-toggle" type="button" aria-expanded="false" aria-controls="side-nav"></button>
    <nav class="side-nav" id="side-nav"></nav>`;
  const toggle = side.querySelector<HTMLButtonElement>('.side-toggle')!;
  const list = side.querySelector<HTMLElement>('.side-nav')!;
  const setOpen = (open: boolean) => {
    side.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!side.classList.contains('open')));
  list.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) setOpen(false);
  });
  let shown: Section | undefined;

  return {
    /** Shows the navigation for page `id`, or none for pages outside any section (the home page, About). */
    show(id: string | null) {
      const s = id ? sectionOf(id) : undefined;
      for (const a of tabs.querySelectorAll('a')) a.toggleAttribute('aria-current', a.dataset.section === s?.id);
      side.hidden = !s;
      pager.hidden = !s;
      setOpen(false);
      if (!s || !id) return;
      if (s !== shown) {
        list.setAttribute('aria-label', s.name);
        list.innerHTML = sidebarHtml(s);
        shown = s;
      }
      for (const a of list.querySelectorAll('a')) {
        const here = new URL(a.href).searchParams.get('p') === id;
        a.toggleAttribute('aria-current', here);
        if (here && !side.classList.contains('open')) a.scrollIntoView({ block: 'nearest' });
      }
      const pages = pagesOf(s);
      const i = pages.findIndex((x) => x.id === id);
      toggle.innerHTML = `<span>${esc(s.name)}</span><b>${esc(pages[i]?.name ?? '')}</b>`;
      const link = (x: { id: string; name: string } | undefined, dir: 'prev' | 'next') => x
        ? `<a class="${dir}" href="?p=${x.id}" data-nav><span>${dir === 'prev' ? '← Previous' : 'Next →'}</span><b>${esc(x.name)}</b></a>`
        : '<span></span>';
      pager.innerHTML = link(pages[i - 1], 'prev') + link(pages[i + 1], 'next');
    },
  };
}
