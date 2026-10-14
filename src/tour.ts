import type { TourStop, Waveform } from './core/types';

export interface TourHooks {
  /** The waveform currently on screen. */
  wave(): Waveform | null;
  /** Zoom and pan so `view` fills the scope, dimming outside `focus`. */
  show(stop: TourStop, animate: boolean): void;
  /** Put the caption where the bit explanations usually go. */
  caption(stop: TourStop | null): void;
  /** Called when the tour ends, to restore the normal view. */
  exit(): void;
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

  const stops = () => hooks.wave()?.tour ?? [];
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
    goTo(0);
    next.focus();
  }

  function stop() {
    if (!active()) return;
    index = -1;
    bar.hidden = true;
    toolbar.hidden = false;
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
      goTo(index, false);
    },
  };
}
