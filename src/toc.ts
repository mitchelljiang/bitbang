/**
 * "On this page": a rail beside the sheet listing the page's sections, with the one being read marked as the page
 * scrolls. Only on pages inside a section, with at least two headings, on windows wide enough for a third column
 * (style.css shows it from 1440 px, where the instruments keep their full width beside it). Headings without an id get one from their text, so the rail can point at them.
 */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

export function mountToc(shell: HTMLElement) {
  const toc = Object.assign(document.createElement('nav'), { className: 'page-toc', hidden: true });
  toc.setAttribute('aria-label', 'On this page');
  shell.append(toc);
  let heads: HTMLElement[] = [];

  function build() {
    const used = new Set<string>();
    // The page's own headings and the sections under it (questions, resources), not headings inside an instrument.
    heads = [...document.querySelectorAll<HTMLElement>('#content > main:not([hidden]) h2, #content > section:not([hidden]) > h2')]
      .filter((h) => h.offsetParent !== null && !h.closest('.debugger, .trace, .diagram, .instrument'));
    for (const h of heads) {
      if (!h.id) h.id = slug(h.textContent ?? '') || 'section';
      while (used.has(h.id)) h.id += '-2';
      used.add(h.id);
    }
    toc.hidden = shell.classList.contains('no-side') || heads.length < 2;
    toc.innerHTML = `<p>On this page</p><ol>${heads.map((h, i) =>
      `<li><a href="#${h.id}" data-i="${i}">${esc((h.textContent ?? '').trim())}</a></li>`).join('')}</ol><a class="page-toc-top" href="#">Back to top</a>`;
    mark();
  }

  /** The last heading to have passed the upper third of the window is the one being read. */
  function mark() {
    let cur = -1;
    heads.forEach((h, i) => { if (h.getBoundingClientRect().top < window.innerHeight * 0.35) cur = i; });
    for (const a of toc.querySelectorAll<HTMLElement>('a[data-i]')) {
      const on = +a.dataset.i! === cur;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    }
  }

  toc.addEventListener('click', (e) => {
    const a = (e.target as Element).closest('a');
    if (!a) return;
    e.preventDefault();
    const h = a.dataset.i !== undefined ? heads[+a.dataset.i] : null;
    if (h) h.scrollIntoView(); else window.scrollTo({ top: 0 });
  });
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; mark(); });
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  let later = 0;
  return {
    /** Call after every route: the page under the rail has changed. Questions and resources arrive a moment later. */
    routed() {
      build();
      clearTimeout(later);
      later = window.setTimeout(build, 400);
    },
  };
}
