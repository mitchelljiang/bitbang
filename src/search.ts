import { bitTopics } from './bits';
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
  /** The words a text search can match, split once when the index is built. */
  words: string[];
}

/** Splits text into words, keeping hyphenated words whole and also adding their parts ("on-board", "on", "board"). */
const tokens = (text: string) =>
  text.toLowerCase().split(/[\s,.;:()/"“”]+/).filter(Boolean).flatMap((t) => (t.includes('-') ? [t, ...t.split('-')] : [t]));

/** Every page and planned page on the site, with the words a search can match: names, description, group and tags. */
export const index: SearchEntry[] = [...catalog, ...bitTopics].flatMap((cat) =>
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
      words: tokens([e.id, e.name, e.name.replace('²', '2').replace('³', '3'), e.full, e.blurb, cat.name, p?.fullName, ...tags]
        .filter(Boolean).join(' ')),
    };
  }),
);

/**
 * True when every word of the query starts some word of the entry. Matching word starts, rather than anywhere
 * inside, keeps "synchronous" from also finding "asynchronous".
 */
export const matches = (entry: SearchEntry, query: string) =>
  tokens(query).every((q) => entry.words.some((w) => w.startsWith(q)));

/**
 * Result rows: protocols with pages first, then ones still to come. A tag search lists exactly the protocols that
 * carry that tag; a text search matches names, descriptions and tags word by word.
 */
function resultsHtml(q: string, tag: string | null) {
  const found = index.filter((e) => (tag ? e.tags.includes(tag) : matches(e, q)))
    .sort((a, b) => (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1));
  if (!found.length) return `<li class="none">Nothing matches “${esc(q)}”.</li>`;
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
    <input type="search" placeholder="Search by name or tag" aria-label="Search bitbang"
      aria-controls="search-results" autocomplete="off" spellcheck="false">
    <ul class="search-results" id="search-results" hidden></ul>`;
  const input = root.querySelector('input')!;
  const results = root.querySelector<HTMLElement>('.search-results')!;

  /** The tag being shown, when the search came from a tag chip. Typing switches back to a text search. */
  let tag: string | null = null;
  const close = () => (results.hidden = true);
  function show() {
    const q = input.value.trim();
    results.hidden = !q;
    if (q) results.innerHTML = resultsHtml(q, tag);
  }

  input.addEventListener('input', () => {
    tag = null;
    show();
  });
  input.addEventListener('focus', () => {
    if (results.hidden) show();
  });
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
  // Clicks elsewhere close the results, except the tag chip that just opened them.
  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (!root.contains(t) && !t.closest('[data-tag]')) close();
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
    /** Lists exactly the protocols with this tag, as when a tag chip is clicked. */
    searchTag(name: string) {
      tag = name;
      input.value = name;
      show();
      input.focus();
    },
  };
}
