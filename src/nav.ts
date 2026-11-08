import { bitTopics } from './bits';
import { concurrencyTopics } from './concurrency';
import { memoryTopics } from './memory';
import { peripheralTopics } from './peripherals';
import { architectureTopics } from './architecture';
import { compilerTopics } from './compilers';
import { catalog, protocolStart, type Category } from './catalog';
import { esc } from './core/render';
import { statusOf } from './search';
import { areaGlyph } from './art';

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
    id: 'compilers', name: 'Compilers',
    blurb: 'How C becomes the instructions in Flash: the preprocessor, compiler, assembler and linker, and what optimization changes.',
    categories: compilerTopics,
  },
];

const sectionOf = (id: string) =>
  sections.find((s) => s.categories.some((c) => c.entries.some((e) => e.id === id)));

interface Area { id: string; name: string; sections: Section[] }
const by = (...ids: string[]) => ids.map((id) => sections.find((s) => s.id === id)!);
/** The header tabs: each groups a few sections, which the sidebar lists in this order. */
export const areas: Area[] = [
  { id: 'data', name: 'Data', sections: by('bits', 'protocols') },
  { id: 'hardware', name: 'Hardware', sections: by('architecture', 'memory', 'peripherals') },
  { id: 'software', name: 'Software', sections: by('compilers', 'concurrency') },
];
export const areaOf = (s: Section) => areas.find((a) => a.sections.includes(s))!;

/** The section's pages in reading order, skipping ones without a page yet. */
export const pagesOf = (s: Section) => s.categories.flatMap((c) => c.entries.filter((e) => statusOf.get(e.id) !== 'soon'));
/** An area's pages, section after section. Previous and next walk through these. */
const areaPages = (a: Area) => a.sections.flatMap(pagesOf);

function groupsHtml(s: Section) {
  return s.categories.map((cat) => {
    const items = cat.entries.map((e) => {
      const status = statusOf.get(e.id);
      const title = `title="${esc(e.blurb)}"`;
      if (status === 'live') return `<li><a href="?p=${e.id}" data-nav ${title}>${esc(e.name)}</a></li>`;
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
  tabs.innerHTML = areas.map((a) => `<a href="?p=${areaPages(a)[0]?.id ?? ''}" data-nav data-area="${a.id}">${areaGlyph(a.id)}${esc(a.name)}</a>`).join('');
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

  return {
    /** Shows the navigation for page `id`, or none for pages outside any section (the home page, About). */
    show(id: string | null) {
      const s = id ? sectionOf(id) : undefined;
      const area = s && areaOf(s);
      for (const a of tabs.querySelectorAll('a')) a.toggleAttribute('aria-current', a.dataset.area === area?.id);
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
