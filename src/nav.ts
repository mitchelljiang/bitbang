import { bitTopics } from './bits';
import { concurrencyTopics } from './concurrency';
import { memoryTopics } from './memory';
import { peripheralTopics } from './peripherals';
import { architectureTopics } from './architecture';
import { compilerTopics } from './compilers';
import { cTopics } from './clang';
import { powerTopics } from './power';
import { driverTopics } from './drivers';
import { catalog, protocolStart, type Category } from './catalog';
import { esc } from './core/render';
import { statusOf } from './search';
import { areaGlyph } from './art';
import { isRead, onProgress } from './learn';

interface Section {
  id: string;
  name: string;
  /** One or two sentences for the section's card on the home page. */
  blurb: string;
  categories: Category[];
}

/** The parts of the site, grouped under the header tabs by `areas` below. Each lists its pages in the sidebar. */
export const sections: Section[] = [
  {
    id: 'protocols', name: 'Protocols',
    blurb: 'How chips and devices talk to each other over wires, from UART and SPI to USB and PCI Express, with the timing of every edge.',
    categories: [protocolStart, ...catalog],
  },
  {
    id: 'bits', name: 'Bits and bytes',
    blurb: 'How numbers are stored, changed and checked inside a computer: binary, two’s complement, floating point, masks and CRCs.',
    categories: bitTopics,
  },
  {
    id: 'memory', name: 'Memory',
    blurb: 'Where code and data live and how they get there: the memory map, the stack, the heap, memory hardware and virtual memory.',
    categories: memoryTopics,
  },
  {
    id: 'concurrency', name: 'Concurrency',
    blurb: 'How one processor does more than one thing at once: interrupts, tasks and the bugs that come from sharing data.',
    categories: concurrencyTopics,
  },
  {
    id: 'peripherals', name: 'Peripherals',
    blurb: 'The hardware blocks beside the processor: pins, timers, PWM, the ADC and DMA, register by register.',
    categories: peripheralTopics,
  },
  {
    id: 'architecture', name: 'Architecture',
    blurb: 'How the processor runs a program: the instructions it reads, the registers it works in, and the pipeline that runs them.',
    categories: architectureTopics,
  },
  {
    id: 'c', name: 'C for embedded',
    blurb: 'The parts of C that matter on a microcontroller: where variables live, integer types, structs and bit fields, pointers and functions.',
    categories: cTopics,
  },
  {
    id: 'compilers', name: 'Compilers',
    blurb: 'How C becomes the instructions in Flash: the preprocessor, compiler, assembler and linker, and what optimization changes.',
    categories: compilerTopics,
  },
  {
    id: 'power', name: 'Power and clocks',
    blurb: 'Where a chip’s clocks come from and how it saves energy: PLLs, sleep modes, battery life and brown-out.',
    categories: powerTopics,
  },
  {
    id: 'drivers', name: 'Drivers',
    blurb: 'Writing the code that talks to hardware: register access, HAL design, ring buffers, interrupts and DMA.',
    categories: driverTopics,
  },
];

const sectionOf = (id: string) =>
  sections.find((s) => s.categories.some((c) => c.entries.some((e) => e.id === id)));

interface Area { id: string; name: string; sections: Section[] }
const by = (...ids: string[]) => ids.map((id) => sections.find((s) => s.id === id)!);
/** The header tabs: each groups a few sections, which the sidebar lists in this order. */
export const areas: Area[] = [
  { id: 'data', name: 'Data', sections: by('bits', 'protocols') },
  { id: 'hardware', name: 'Hardware', sections: by('architecture', 'memory', 'peripherals', 'power') },
  { id: 'software', name: 'Software', sections: by('c', 'compilers', 'concurrency', 'drivers') },
];
const areaOf = (s: Section) => areas.find((a) => a.sections.includes(s))!;

/** The section's pages in reading order, skipping ones without a page yet. */
export const pagesOf = (s: Section) => s.categories.flatMap((c) => c.entries.filter((e) => statusOf.get(e.id) !== 'soon'));
/** An area's pages, section after section. Previous and next walk through these. */
const areaPages = (a: Area) => a.sections.flatMap(pagesOf);

function groupsHtml(s: Section) {
  return s.categories.map((cat) => {
    const items = cat.entries.map((e) => {
      const status = statusOf.get(e.id);
      const title = `title="${esc(e.blurb)}"`;
      if (status === 'live') return `<li><a href="?p=${e.id}" data-nav data-page="${e.id}" ${title}>${esc(e.name)}<span class="sr side-read">, read</span></a></li>`;
      if (status === 'wip') return `<li><a class="wip" href="?p=${e.id}" data-nav ${title}>${esc(e.name)}<span class="sr">, in progress</span></a></li>`;
      return `<li class="soon" ${title}>${esc(e.name)}</li>`;
    });
    return `<div class="side-group"><h3>${esc(cat.heading ?? cat.name)}</h3><ul>${items.join('')}</ul></div>`;
  }).join('');
}

/** The area's sections, each a collapsible list of its groups. */
function sidebarHtml(a: Area) {
  return `<p class="side-area">${areaGlyph(a.id)}${esc(a.name)}</p>` + a.sections.map((s) => `
    <details class="side-sec" data-section="${s.id}"><summary>${esc(s.name)}</summary><div class="side-sec-body">${groupsHtml(s)}</div></details>`).join('')
    + (a.sections.some((s) => s.categories.some((c) => c.entries.some((e) => statusOf.get(e.id) === 'wip')))
      ? '<p class="side-key" aria-hidden="true"><i></i>In progress</p>' : '');
}

/**
 * The section tabs in the header, the sidebar beside the content, and the previous/next links under it.
 * On narrow screens the sidebar collapses behind a button.
 */
export function mountNav(tabs: HTMLElement, side: HTMLElement, pager: HTMLElement) {
  // The tabs, then one shared drop-down holding each area's list of sections. Hovering a tab opens the drop-down
  // under it; hovering the next tab slides it across and swaps the list, and it stays open over the gaps between tabs.
  tabs.innerHTML = areas.map((a) => `<a href="?p=${areaPages(a)[0]?.id ?? ''}" data-nav data-area="${a.id}">${areaGlyph(a.id)}${esc(a.name)}</a>`).join('')
    + `<div class="tab-menu">${areas.map((a) => `<ul class="tab-pane" data-pane="${a.id}" aria-label="${esc(a.name)} sections">${a.sections.map((s) => {
      const n = pagesOf(s).length;
      return `<li><a href="?p=${pagesOf(s)[0]?.id ?? ''}" data-nav data-section="${s.id}" tabindex="-1"><b>${esc(s.name)}</b><span>${n} page${n === 1 ? '' : 's'}</span></a></li>`;
    }).join('')}</ul>`).join('')}</div>`;
  const menu = tabs.querySelector<HTMLElement>('.tab-menu')!;
  const canHover = matchMedia('(hover: hover)');
  let current: string | null = null, closing = 0, quiet = false;
  const pane = (id: string) => menu.querySelector<HTMLElement>(`[data-pane="${id}"]`)!;
  const openMenu = (id: string) => {
    clearTimeout(closing);
    if (id === current) return;
    const tab = tabs.querySelector<HTMLElement>(`a[data-area="${id}"]`)!, p = pane(id);
    const w = p.offsetWidth, h = p.offsetHeight, box = tabs.getBoundingClientRect();
    // Under the tab, but never past either edge of the window.
    const x = Math.max(16 - box.left, Math.min(tab.offsetLeft, document.documentElement.clientWidth - 16 - box.left - w));
    const fresh = current === null;
    menu.classList.toggle('snap', fresh);  // opening from closed: appear in place; only a switch slides across
    menu.style.transform = `translateX(${x}px)`;
    menu.style.width = `${w}px`;
    menu.style.height = `${h}px`;
    for (const q of menu.querySelectorAll('.tab-pane')) q.classList.toggle('on', q === p);
    if (fresh) void menu.offsetWidth;
    menu.classList.remove('snap');
    menu.classList.add('open');
    tabs.classList.add('menu-open');
    current = id;
  };
  const closeMenu = () => {
    clearTimeout(closing);
    menu.classList.remove('open');
    tabs.classList.remove('menu-open');
    current = null;
  };
  tabs.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' && !canHover.matches) return;
    const a = (e.target as Element).closest<HTMLElement>('a[data-area]');
    if (a) openMenu(a.dataset.area!);
    else clearTimeout(closing);  // over a gap or the drop-down: keep showing what was last hovered
  });
  tabs.addEventListener('pointerleave', () => { closing = window.setTimeout(closeMenu, 180); });
  tabs.addEventListener('focusin', (e) => {
    const a = (e.target as Element).closest<HTMLElement>('a[data-area]');
    if (a && !quiet) openMenu(a.dataset.area!);
  });
  tabs.addEventListener('focusout', (e) => { if (!tabs.contains(e.relatedTarget as Node | null)) closeMenu(); });
  // Keyboard: Down enters the drop-down, Up and Down move through it, Escape closes it.
  tabs.addEventListener('keydown', (e) => {
    if (!current) return;
    const tab = tabs.querySelector<HTMLElement>(`a[data-area="${current}"]`)!;
    const links = [...pane(current).querySelectorAll<HTMLElement>('a')];
    const i = links.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { closeMenu(); quiet = true; tab.focus(); quiet = false; }
    else if (e.key === 'ArrowDown') links[Math.min(links.length - 1, i + 1)]?.focus();
    else if (e.key === 'ArrowUp') (i > 0 ? links[i - 1] : tab).focus();
    else return;
    e.preventDefault();
  });
  // A click on any link closes the drop-down, even while the pointer is still over it.
  tabs.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('a')) return;
    closeMenu();
    (document.activeElement as HTMLElement | null)?.blur();
  });
  addEventListener('resize', closeMenu);
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
  let shown: Area | undefined;
  let openFor: Section | undefined;
  /** Ticks the pages the reader has finished. */
  const markRead = () => {
    for (const a of list.querySelectorAll<HTMLElement>('a[data-page]')) a.classList.toggle('read', isRead(a.dataset.page!));
  };
  onProgress(markRead);

  return {
    /** Whether page `id` belongs to a section, and so has a sidebar. */
    has: (id: string) => !!sectionOf(id),
    /** Shows the navigation for page `id`, or none for pages outside any section (the home page, About). */
    show(id: string | null) {
      const s = id ? sectionOf(id) : undefined;
      const area = s && areaOf(s);
      for (const a of tabs.querySelectorAll<HTMLElement>('a[data-area]')) a.toggleAttribute('aria-current', a.dataset.area === area?.id);
      for (const a of tabs.querySelectorAll<HTMLElement>('a[data-section]')) a.toggleAttribute('aria-current', a.dataset.section === s?.id);
      side.hidden = !s;
      pager.hidden = !s;
      setOpen(false);
      if (!s || !id || !area) return;
      if (area !== shown) {
        list.setAttribute('aria-label', area.name);
        list.innerHTML = sidebarHtml(area);
        shown = area;
        openFor = undefined;
      }
      markRead();
      // Arriving in a section opens its list; the others stay as the reader left them.
      if (s !== openFor) {
        list.querySelector<HTMLDetailsElement>(`.side-sec[data-section="${s.id}"]`)!.open = true;
        openFor = s;
      }
      for (const a of list.querySelectorAll('a')) {
        const here = new URL(a.href).searchParams.get('p') === id;
        a.toggleAttribute('aria-current', here);
        if (here && !side.classList.contains('open')) a.scrollIntoView({ block: 'nearest' });
      }
      const pages = areaPages(area);
      const i = pages.findIndex((x) => x.id === id);
      toggle.innerHTML = `<span>${esc(s.name)}</span><b>${esc(pages[i]?.name ?? '')}</b>`;
      const link = (x: { id: string; name: string } | undefined, dir: 'prev' | 'next') => x
        ? `<a class="${dir}" href="?p=${x.id}" data-nav><span>${dir === 'prev' ? '← Previous' : 'Next →'}</span><b>${esc(x.name)}</b></a>`
        : '<span></span>';
      pager.innerHTML = link(pages[i - 1], 'prev') + link(pages[i + 1], 'next');
    },
  };
}
