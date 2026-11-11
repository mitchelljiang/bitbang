/**
 * Learning paths (?p=paths): each path in src/paths.ts as a numbered route, with the reader's progress along it. A
 * step's link carries `data-path`, so following it puts the reader on that path (the bar above Previous and Next then
 * leads from step to step). Progress is read from src/learn.ts and lives only in the browser.
 */
import { esc } from '../core/render';
import { allCategories } from '../allTopics';
import { PATHS, type Path } from '../paths';
import { anyRead, isRead, onProgress, readCount, resetProgress } from '../learn';

const entries = new Map(allCategories.flatMap((c) => c.entries.map((e) => [e.id, { name: e.name, group: c.name }] as const)));
/** The name and sidebar group of a page, for a step's label. */
export const pageName = (id: string) => entries.get(id)?.name ?? id;

/** The first step not yet read, or null when the path is finished. */
export const nextStep = (p: Path) => p.steps.find(([id]) => !isRead(id))?.[0] ?? null;

function pathHtml(p: Path) {
  const ids = p.steps.map(([id]) => id);
  const done = readCount(ids), next = nextStep(p);
  return `
    <section class="ov-route path" id="${p.id}" aria-labelledby="path-${p.id}">
      <header><h2 id="path-${p.id}">${esc(p.name)}</h2><span>${done ? `${done} of ${ids.length} read` : `${ids.length} pages`}</span></header>
      <p class="path-who">${esc(p.who)} ${esc(p.intro)}</p>
      <ol class="path-steps">${p.steps.map(([id, why], i) => `
        <li class="${isRead(id) ? 'read' : ''}">
          <span class="ov-num" aria-hidden="true">${isRead(id) ? '✓' : i + 1}</span>
          <a href="?p=${id}" data-nav data-path="${p.id}"><b>${esc(pageName(id))}</b><i>${esc(entries.get(id)?.group ?? '')}</i>${isRead(id) ? '<span class="sr">, read</span>' : ''}</a>
          <span class="path-why">${esc(why)}</span>
        </li>`).join('')}
      </ol>
      <p class="ov-go">${next
        ? `<a href="?p=${next}" data-nav data-path="${p.id}">${done ? 'Continue' : 'Start'} with ${esc(pageName(next))} →</a>`
        : '<span class="path-done">Finished. Every page on this path is read.</span>'}</p>
    </section>`;
}

export function mountPaths(root: HTMLElement) {
  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Where to start</p>
      <h1>Learning paths</h1>
      <p>The sections sort the site by subject. A path sorts it by reader: a short route across several sections, in an
        order where each page needs only the ones before it. Pick the one closest to you. Pages you read to the end are
        ticked here and in the sidebar; that record stays in this browser and is sent nowhere.</p>
      <p class="path-jump">${PATHS.map((p) => `<a href="#${p.id}">${esc(p.name)}</a>`).join('')}</p>
    </section>
    <div class="path-list"></div>
    <p class="path-reset" hidden><button type="button">Clear my reading progress</button></p>`;
  const list = root.querySelector<HTMLElement>('.path-list')!;
  const reset = root.querySelector<HTMLElement>('.path-reset')!;
  const draw = () => {
    list.innerHTML = PATHS.map(pathHtml).join('');
    reset.hidden = !anyRead();
  };
  draw();
  onProgress(() => { if (root.isConnected) draw(); });
  reset.querySelector('button')!.addEventListener('click', resetProgress);
  // The jump links scroll within the page; the site's router only handles ?p= links.
  root.querySelector('.path-jump')!.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a');
    if (!a) return;
    e.preventDefault();
    document.getElementById(a.hash.slice(1))?.scrollIntoView();
  });
}
