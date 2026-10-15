import type { TourStop, Waveform } from './core/types';

/** Every walkthrough motion (the page scroll and the diagram's zoom and pan) shares this timing, so they move as one. */
export const MOTION_MS = 450;
export const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export interface TourHooks {
  /** The waveform currently on screen. */
  wave(): Waveform | null;
  /** Zoom and pan so `view` fills the scope, dimming outside `focus`. */
  show(stop: TourStop, animate: boolean): void;
  /** Put the caption where the bit explanations usually go. */
  caption(stop: TourStop | null): void;
  /** Called when the tour ends, to restore the normal view. */
  exit(): void;
  /**
   * Fixes the caption box at the height of the tallest caption in this tour (true), or lets it fit its text again
   * (false), so stepping through never changes the layout.
   */
  holdCaptionHeight(on: boolean): void;
}

/**
 * The walkthrough: Back / Next through a waveform's tour stops, with an overview strip of the whole frame.
 * The bar sits where the toolbar normally is; the toolbar comes back when the tour ends.
 */
export function mountTour(bar: HTMLElement, toolbar: HTMLElement, button: HTMLButtonElement, hooks: TourHooks) {
  const count = bar.querySelector<HTMLElement>('.tour-count')!;
  const title = bar.querySelector<HTMLElement>('.tour-title')!;
  const prev = bar.querySelector<HTMLButtonElement>('.tour-prev')!;
  const next = bar.querySelector<HTMLButtonElement>('.tour-next')!;
  const exitBtn = bar.querySelector<HTMLButtonElement>('.tour-exit')!;
  const strip = bar.querySelector<HTMLElement>('.strip')!;
  let index = -1;

  const instrument = bar.closest<HTMLElement>('.instrument') ?? bar;

  const stops = () => hooks.wave()?.tour ?? [];

  let scrollAnim = 0;
  /**
   * Centers the walkthrough (bar, diagram and caption) in the window, or puts its top at the top if it is taller than
   * the window. It runs frame by frame alongside the first zoom, with the same duration and easing, so the two arrive
   * together. Any scroll by the reader cancels it.
   */
  function center() {
    cancelAnimationFrame(scrollAnim);
    const MARGIN = 12;
    const box = instrument.getBoundingClientRect();
    const by = box.height > window.innerHeight - 2 * MARGIN
      ? box.top - MARGIN
      : box.top + box.height / 2 - window.innerHeight / 2;
    if (Math.abs(by) < 2) return;
    const from = window.scrollY;
    const jump = (y: number) => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return jump(from + by);
    const cancel = () => cancelAnimationFrame(scrollAnim);
    window.addEventListener('wheel', cancel, { once: true, passive: true });
    window.addEventListener('touchstart', cancel, { once: true, passive: true });
    const t0 = performance.now();
    const frame = (now: number) => {
      const k = Math.min(1, (now - t0) / MOTION_MS);
      jump(from + by * easeInOut(k));
      if (k < 1) scrollAnim = requestAnimationFrame(frame);
    };
    scrollAnim = requestAnimationFrame(frame);
  }


  const active = () => index >= 0;

  /** One block per field, sized by time, plus a frame showing the stop's view. */
  function drawStrip() {
    const w = hooks.wave();
    if (!w) return;
    const blocks = w.fields
      .map((f) => {
        const left = (f.t0 / w.duration) * 100;
        const width = ((f.t1 - f.t0) / w.duration) * 100;
        return `<span class="block k-${f.kind}" style="left:${left}%;width:${width}%" title="${f.label.replace(/"/g, '&quot;')}"></span>`;
      })
      .join('');
    strip.innerHTML = `${blocks}<span class="window"></span>`;
  }

  function moveWindow(stop: TourStop) {
    const w = hooks.wave();
    const win = strip.querySelector<HTMLElement>('.window');
    if (!w || !win) return;
    const [a, b] = stop.focus ?? stop.view;
    win.style.left = `${(a / w.duration) * 100}%`;
    win.style.width = `${Math.max(0.6, ((b - a) / w.duration) * 100)}%`;
  }

  function goTo(i: number, animate = true) {
    const list = stops();
    if (!list.length) return stop();
    index = Math.max(0, Math.min(list.length - 1, i));
    const s = list[index];
    count.textContent = `${index + 1} / ${list.length}`;
    title.textContent = s.title;
    prev.disabled = index === 0;
    next.disabled = index === list.length - 1;
    moveWindow(s);
    hooks.caption(s);
    hooks.show(s, animate);
  }

  function start() {
    if (!stops().length) return;
    bar.hidden = false;
    toolbar.hidden = true;
    drawStrip();
    hooks.holdCaptionHeight(true);
    next.focus({ preventScroll: true });
    // The layout is final now (bar shown, caption height held), so one centering is all it takes.
    goTo(0);
    center();
  }

  function stop() {
    if (!active()) return;
    index = -1;
    cancelAnimationFrame(scrollAnim);
    bar.hidden = true;
    toolbar.hidden = false;
    hooks.holdCaptionHeight(false);
    hooks.caption(null);
    hooks.exit();
    button.focus();
  }

  button.addEventListener('click', start);
  prev.addEventListener('click', () => goTo(index - 1));
  next.addEventListener('click', () => goTo(index + 1));
  exitBtn.addEventListener('click', stop);
  strip.addEventListener('click', (e) => {
    const w = hooks.wave();
    if (!w) return;
    const box = strip.getBoundingClientRect();
    const t = ((e.clientX - box.left) / box.width) * w.duration;
    // Jump to the narrowest stop that covers the clicked moment.
    let best = -1;
    stops().forEach((s, i) => {
      const [a, b] = s.focus ?? s.view;
      const [ba, bb] = best >= 0 ? (stops()[best].focus ?? stops()[best].view) : [0, Infinity];
      if (t >= a && t <= b && b - a < bb - ba) best = i;
    });
    if (best >= 0) goTo(best);
  });

  return {
    active,
    start,
    stop,
    next: () => goTo(index + 1),
    prev: () => goTo(index - 1),
    /** The waveform changed (new settings or a resize): redraw without animating, or end the tour if it has none. */
    refresh() {
      button.hidden = !stops().length;
      if (!active()) return;
      if (!stops().length) return stop();
      drawStrip();
      hooks.holdCaptionHeight(true);
      goTo(index, false);
    },
  };
}
