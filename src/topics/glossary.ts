/**
 * Glossary (?p=glossary): every term the sections' Start here pages define, in one alphabetical list, each with the
 * page that explains it. The terms are not written here: they come from `OVERVIEWS` in overview.ts, so a term added to
 * a section appears here and in the site search too.
 */
import { esc } from '../core/render';
import { areas } from '../nav';
import { statusOf } from '../search';
import { OVERVIEWS } from './overview';
import { pageName } from './paths';

export interface GlossaryTerm { term: string; def: string; page?: string; section: string }

const sectionName = new Map(areas.flatMap((a) => a.sections.map((s) => [s.id, s.name] as const)));
/** Every term, A to Z. A term two sections define differently appears once for each. */
export const TERMS: GlossaryTerm[] = Object.entries(OVERVIEWS)
  .flatMap(([id, o]) => o.terms.map((t) => ({ ...t, section: sectionName.get(id) ?? id })))
  .sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));

const termHtml = (t: GlossaryTerm) => `
  <div class="gl-term" data-text="${esc(`${t.term} ${t.def}`.toLowerCase())}">
    <dt>${esc(t.term)}<span>${esc(t.section)}</span></dt>
    <dd>${esc(t.def)}${t.page && statusOf.get(t.page) === 'live' ? ` <a href="?p=${t.page}" data-nav>${esc(pageName(t.page))} →</a>` : ''}</dd>
  </div>`;

export function mountGlossary(root: HTMLElement) {
  const letters = [...new Set(TERMS.map((t) => t.term[0].toUpperCase()))];
  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Reference</p>
      <h1>Glossary</h1>
      <p>The ${TERMS.length} terms the site leans on, each in a sentence, with the page that shows it working. Search
        from anywhere with <kbd>/</kbd> finds these too.</p>
      <p class="gl-filter"><input type="search" placeholder="Filter terms" aria-label="Filter terms" autocomplete="off" spellcheck="false"></p>
    </section>
    <div class="gl-list">${letters.map((l) => `
      <section class="gl-letter" aria-label="${l}">
        <h2>${l}</h2>
        <dl>${TERMS.filter((t) => t.term[0].toUpperCase() === l).map(termHtml).join('')}</dl>
      </section>`).join('')}
    </div>
    <p class="gl-none" hidden>No term matches.</p>`;
  const input = root.querySelector('input')!;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    for (const sec of root.querySelectorAll<HTMLElement>('.gl-letter')) {
      let any = false;
      for (const t of sec.querySelectorAll<HTMLElement>('.gl-term')) {
        const hit = t.dataset.text!.includes(q);
        t.hidden = !hit;
        any ||= hit;
        if (hit) shown++;
      }
      sec.hidden = !any;
    }
    root.querySelector<HTMLElement>('.gl-none')!.hidden = shown > 0;
  });
}
