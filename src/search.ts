import { catalog } from './catalog';
import { esc } from './core/render';
import { protocols } from './protocols';

const byId = new Map(protocols.map((p) => [p.id, p]));

export interface SearchEntry {
  id: string;
  name: string;
  group: string;
  blurb: string;
  tags: string[];
  /** 'live' has a page, 'wip' has an under-construction page, 'soon' has no page yet. */
  status: 'live' | 'wip' | 'soon';
  text: string;
}

/** Every protocol in the menu, with the text a search can match: names, description, group and tags. */
export const index: SearchEntry[] = catalog.flatMap((cat) =>
  cat.entries.map((e) => {
    const p = byId.get(e.id);
    const tags = p?.tags ?? [];
    return {
      id: e.id,
      name: e.name,
      group: cat.name,
      blurb: e.blurb,
      tags,
      status: p ? 'live' : e.wip ? 'wip' : 'soon',
      // Include the id and a plain-digit spelling, so "i2c" finds I²C.
      text: [e.id, e.name, e.name.replace('²', '2').replace('³', '3'), e.full, e.blurb, cat.name, p?.fullName, ...tags]
        .filter(Boolean).join(' ').toLowerCase(),
    };
  }),
);

/** Splits text into words, keeping hyphenated words whole and also adding their parts ("on-board", "on", "board"). */
const tokens = (text: string) =>
  text.toLowerCase().split(/[\s,.;:()/"“”]+/).filter(Boolean).flatMap((t) => (t.includes('-') ? [t, ...t.split('-')] : [t]));

/**
 * True when every word of the query starts some word of the text. Matching word starts, rather than anywhere inside,
 * keeps "synchronous" from also finding "asynchronous".
 */
export function matchesText(text: string, query: string) {
  const words = tokens(text);
  return tokens(query).every((q) => words.some((w) => w.startsWith(q)));
}
export const matches = (entry: { text: string }, query: string) => matchesText(entry.text, query);

/** Result rows for a query: protocols with pages first, then ones still to come. */
function resultsHtml(q: string) {
  const found = index.filter((e) => matches(e, q))
    .sort((a, b) => (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1));
  if (!found.length) return `<li class="none">No protocols match “${esc(q)}”.</li>`;
  return found.map((e) => {
    const head = `<span class="r-name">${esc(e.name)}</span><span class="r-group">${esc(e.group)}</span>` +
      (e.status === 'live' ? '' : `<span class="r-status">${e.status === 'wip' ? 'in progress' : 'soon'}</span>`);
    const body = `<span class="r-blurb">${esc(e.blurb)}</span>` +
      (e.tags.length ? `<span class="r-tags">${e.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</span>` : '');
    return e.status === 'soon'
      ? `<li class="soon"><div>${head}</div>${body}</li>`
      : `<li><a href="?p=${e.id}" data-nav><div>${head}</div>${body}</a></li>`;
  }).join('');
}

/**
 * The search box in the top bar. Results drop down below it; "/" focuses it from anywhere, Enter opens the first
 * result, and Escape or a click elsewhere closes it.
 */
export function mountSearch(root: HTMLElement) {
  root.innerHTML = `
    <input type="search" placeholder="Search protocols by name or tag" aria-label="Search protocols"
      aria-controls="search-results" autocomplete="off" spellcheck="false">
    <ul class="search-results" id="search-results" hidden></ul>`;
  const input = root.querySelector('input')!;
  const results = root.querySelector<HTMLElement>('.search-results')!;

  const close = () => (results.hidden = true);
  function show() {
    const q = input.value.trim();
    results.hidden = !q;
    if (q) results.innerHTML = resultsHtml(q);
  }

  input.addEventListener('input', show);
  input.addEventListener('focus', show);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = results.querySelector<HTMLAnchorElement>('a');
      if (first) {
        e.preventDefault();
        first.click();
      }
    } else if (e.key === 'Escape') {
      close();
      input.blur();
    }
  });
  // Picking a result navigates (handled by the page's data-nav links) and clears the search.
  results.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) {
      input.value = '';
      close();
    }
  });
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target as Node)) close();
  });
  document.addEventListener('keydown', (e) => {
    const typing = e.target instanceof Element && e.target.closest('input, select, textarea, [contenteditable]');
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  return {
    /** Runs a search, e.g. when a tag is clicked. */
    search(query: string) {
      input.value = query;
      input.focus();
      show();
    },
  };
}
