import { GUTTER, esc, groupSteps, readout, render, type Rendered, type Step } from './core/render';
import { pagesOf, sections } from './nav';
import { index } from './search';
import { uart } from './protocols/uart';
import { mountScopeAids } from './cursor';

/** The UART frame the home page opens on: real output of the UART page's encoder, so it is as accurate as that page. */
const hi = uart.encode({ ...Object.fromEntries(uart.params.map((x) => [x.key, x.default])), data: 'Hi', format: 'text' });
const steps: Step[] = groupSteps(hi.bits);
const HINT = '<p class="hint">Click any bit, or use <kbd>←</kbd> <kbd>→</kbd> to step through them.</p>';
const statusOf = new Map(index.map((e) => [e.id, e.status]));
const nameOf = new Map(index.map((e) => [e.id, e.name]));

/** One card per section, from the same list as the header tabs, so a new section appears here automatically. */
function cardsHtml() {
  return sections.map((s) => {
    const pages = pagesOf(s);
    const ready = pages.filter((p) => statusOf.get(p.id) === 'live').length;
    const picks = s.featured.filter((id) => statusOf.get(id) !== 'soon');
    return `
      <article class="card">
        <h2><a href="?p=${pages[0].id}" data-nav>${esc(s.name)}</a></h2>
        <p>${esc(s.blurb)}</p>
        <p class="card-meta">${ready ? `${ready} interactive pages` : 'In progress'}</p>
        <p class="card-links">
          <a href="?p=${pages[0].id}" data-nav>Start with ${esc(pages[0].name)}</a>
          ${picks.map((id) => `<a href="?p=${id}" data-nav>${esc(nameOf.get(id) ?? id)}</a>`).join('')}
        </p>
      </article>`;
  }).join('');
}

/**
 * The landing page. On a fresh visit it opens like a scope catching a signal: the "Hi" frame sweeps across the
 * screen, then the headline above it and the rest of the page appear. Their space is kept while hidden, so nothing
 * moves. Later visits, and readers who prefer less motion, see it all at once.
 */
export function mountHome(root: HTMLElement) {
  root.innerHTML = `
    <section class="hero after">
      <h1>Embedded systems, one bit at a time.</h1>
      <p>Interactive diagrams for learning how embedded hardware really works: what travels on the wires, and what the
        bits mean when they arrive.</p>
    </section>
    <section class="demo instrument">
      <div class="readout"></div>
      <div class="scope" tabindex="0" aria-label="UART waveform of the text Hi. Use the arrow keys to step through the bits."></div>
      <div class="explain" aria-live="polite">${HINT}</div>
    </section>
    <div class="cards after">${cardsHtml()}</div>`;

  const scope = root.querySelector<HTMLElement>('.demo .scope')!;
  const explain = root.querySelector<HTMLElement>('.demo .explain')!;
  let drawn: Rendered | undefined;
  let current = -1;
  const say = (html: string) => (explain.innerHTML = html);
  const pick = (i: number) => {
    current = Math.max(-1, Math.min(steps.length - 1, i));
    const step = steps[current] ?? null;
    drawn?.select(step);
    if (!step) return say(HINT);
    explain.replaceChildren(...step.bits.map((bit) => {
      const p = document.createElement('p');
      p.append(Object.assign(document.createElement('span'), { className: `tag k-${bit.kind}`, textContent: bit.label }), ' ', bit.info);
      return p;
    }));
  };
  scope.addEventListener('keydown', (e) => {
    const move = ({ ArrowRight: 1, ArrowLeft: -1 } as Record<string, number>)[e.key];
    if (!move) return;
    e.preventDefault();
    pick(current + move);
  });
  let resizeTimer: number | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => !root.hidden && draw(), 150);
  });
  const aids = mountScopeAids(scope, root.querySelector<HTMLElement>('.demo .readout')!,
    () => (drawn ? { ppu: drawn.ppu, duration: hi.duration, unitTime: hi.unitTime } : null));
  /** Draws to the current width. Called when the home page is shown, since a hidden page has no width to fit. */
  function draw() {
    drawn = render(scope, hi, steps, { zoom: 'fit', onPick: pick, onHover: () => {} });
    const bar = root.querySelector<HTMLElement>('.demo .readout')!;
    bar.innerHTML = readout(hi, drawn.divTime, 'UART: “Hi”') +
      '<button type="button" class="rd-replay" title="Play the sweep again">↻ Replay</button>';
    aids.refresh();
    pick(current);
  }

  let sweeping: Animation[] = [];
  /**
   * The opening: wait for the trigger, then sweep the trace left to right behind a bright beam. On the first visit the
   * rest of the page is hidden until the beam has drawn all of "Hi" (`hideText`); a replay leaves the page as it is.
   */
  function sweep(hideText: boolean) {
    sweeping.forEach((a) => a.cancel());
    scope.querySelector('.beam')?.remove();
    const svg = scope.querySelector('svg')!;
    const width = svg.getBoundingClientRect().width;
    const DELAY = 350;
    const DURATION = 1200;
    if (hideText) root.classList.add('opening');
    say('<p class="hint">Waiting for a falling edge…</p>');
    const beam = Object.assign(document.createElement('div'), { className: 'beam' });
    scope.append(beam);
    // A steady sweep, as on a scope. The trace and the beam share the timing, so the beam sits at the trace's leading edge.
    const timing = { delay: DELAY, duration: DURATION, easing: 'linear', fill: 'both' } as const;
    const trace = svg.animate([{ clipPath: `inset(0 ${width - GUTTER}px 0 0)` }, { clipPath: 'inset(0 0 0 0)' }], timing);
    const run = beam.animate([{ transform: `translateX(${GUTTER}px)` }, { transform: `translateX(${width}px)` }], timing);
    sweeping = [trace, run];
    const trigger = setTimeout(() => say('<p class="hint">Start condition met!</p>'), DELAY);
    // Reveal the page as soon as the beam has drawn all of "Hi" (the end of the last stop bit), rather than when it
    // reaches the edge. The sweep is linear, so the beam is a fraction p of the way across after p of the duration.
    const lastBit = Math.max(...hi.bits.map((b) => b.t1));
    const p = Math.min(1, (lastBit * drawn!.ppu) / (width - GUTTER));
    const reveal = () => {
      if (!root.classList.contains('opening')) return;
      root.classList.replace('opening', 'opened');
    };
    const early = setTimeout(reveal, DELAY + p * DURATION);
    const done = () => {
      clearTimeout(trigger);
      clearTimeout(early);
      beam.remove();
      say(HINT);
      reveal();
    };
    run.finished.then(done, () => {});
    // Any click, key, scroll or touch during the opening finishes it at once: nobody should have to wait for it.
    if (hideText) {
      const skip = () => {
        sweeping.forEach((a) => a.finish());
        stopListening();
      };
      const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
      const stopListening = () => events.forEach((ev) => window.removeEventListener(ev, skip));
      events.forEach((ev) => window.addEventListener(ev, skip, { once: true, passive: true }));
      run.finished.then(stopListening, () => {});
    }
  }
  root.addEventListener('click', (e) => {
    if ((e.target as Element).closest('.rd-replay')) sweep(false);
  });

  // Only a fresh visit to the home page gets the opening; arriving from another page shows it all at once.
  let played = new URLSearchParams(location.search).has('p') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    show() {
      draw();
      if (played) return;
      played = true;
      // The opening plays at the top of the page. A reload would otherwise restore an old scroll position partway
      // through it, which looks like the page jumping.
      history.scrollRestoration = 'manual';
      window.scrollTo(0, 0);
      sweep(true);
    },
  };
}
