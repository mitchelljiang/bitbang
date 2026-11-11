/**
 * Page addresses. A page lives at /<id> (bitbang.fyi/uart); the home page is the site root. Links in the source and
 * the vault are still written `?p=<id>`, the older form: they are rewritten to the short address as they enter the
 * page, and an old `?p=` link opened from outside is shown and then replaced in the address bar.
 */

/** The page a location or link points at; '' is the home page. */
export function pageId(at: Location | URL = location): string {
  const p = new URLSearchParams(at.search).get('p');
  if (p !== null) return p;
  const last = at.pathname.split('/').filter(Boolean).pop() ?? '';
  return last.replace(/\.html$/, '').replace(/^index$/, '');
}

/** The address of page `id`, with optional settings and a heading. */
export function pageUrl(id: string, query = '', hash = ''): string {
  return new URL(`./${id}${query ? `?${query}` : ''}${hash}`, document.baseURI).href;
}

/** The short form of an address written with `?p=`; any other address is returned as it is. */
export function shortUrl(href: string): string {
  const u = new URL(href, document.baseURI);
  const id = u.searchParams.get('p');
  if (id === null) return u.href;
  u.searchParams.delete('p');
  return pageUrl(id, u.searchParams.toString(), u.hash);
}

/** Rewrites `?p=` links to short addresses, now and as pages are built, so hovering or copying a link shows it. */
export function shortenLinks() {
  const fix = (root: ParentNode) => {
    for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href^="?p="]')) a.href = shortUrl(a.href);
  };
  fix(document);
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) {
      if (!(n instanceof Element)) continue;
      if (n instanceof HTMLAnchorElement && n.getAttribute('href')?.startsWith('?p=')) n.href = shortUrl(n.href);
      else if (n.firstElementChild) fix(n);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
