/**
 * The Concurrency section's instrument: a trace timeline drawn like a logic analyzer, on the same bench and in the same
 * palette as the scope and the memory instrument. One lane per thread of execution (or per shared variable), time left
 * to right, a gold cursor at the current step, and an explain line under the glass. A page supplies the lanes, the
 * bars and the steps; this draws them and runs Back / Step / Play / Restart.
 */
import { esc } from '../core/render';

export interface Lane {
  id: string;
  name: string;
  /** Small text under the name, such as a priority. May hold HTML, such as a button that changes it. */
  sub: string;
  /** The lane's color, any CSS color, usually a channel such as var(--ch2). */
  color: string;
  /** A value lane: a shared variable, drawn as a bus with its value written in. */
  bus?: boolean;
}

/**
 * run = executing; bg = the background loop; hatch = the processor saving or restoring registers; ready = able to run
 * but waiting for the CPU; blocked = waiting for a lock or a signal; hold = executing while holding a lock; value = a
 * variable's value on a bus lane, and bad = a value that is wrong. ok / fail / warn = an outcome: right, wrong, or not
 * guaranteed.
 */
export type BarKind = 'run' | 'bg' | 'hatch' | 'ready' | 'blocked' | 'hold' | 'value' | 'bad' | 'ok' | 'fail' | 'warn';
export interface Bar { lane: string; t0: number; t1: number; kind: BarKind; label?: string }

/** fire = an event arriving (an interrupt, a task release); deadline = when a job must be done; miss = it was not. */
export interface Mark { lane: string; t: number; kind: 'fire' | 'deadline' | 'miss'; title: string }

/** One step of the walkthrough: the bar it lights, where the cursor sits, the lane holding the CPU, and what happened. */
export interface Step { bar: number; at: number; lane: string; note: string; readout: string[] }

/** `every` spaces the ruler's labels; `minor`, if set, spaces the graticule lines more finely. */
export interface Trace { lanes: Lane[]; bars: Bar[]; marks?: Mark[]; end: number; every: number; minor?: number }

const STEP_BUTTONS = `
  <button type="button" class="tr-btn" data-act="back">Back</button>
  <button type="button" class="tr-btn primary" data-act="step">Step</button>
  <button type="button" class="tr-btn" data-act="play">Play</button>
  <button type="button" class="tr-btn" data-act="restart">Restart</button>`;

/** The panel: title, step buttons and a row of settings on the face, then the glass with a readout, the lanes and an optional side pane. */
export const traceHtml = (o: { label: string; title: string; controls?: string; buttons?: string; side?: string; cls?: string }) => `
  <section class="trace${o.cls ? ` ${o.cls}` : ''}" aria-label="${esc(o.label)}">
    <header class="tr-bar">
      <span class="tr-title">${esc(o.title)}</span>
      <div class="tr-controls">${o.buttons ?? STEP_BUTTONS}</div>
      ${o.controls ? `<div class="tr-set">${o.controls}</div>` : ''}
    </header>
    <div class="tr-screen">
      <div class="tr-readout"></div>
      <div class="tr-grid"></div>
      ${o.side ?? ''}
    </div>
    <p class="tr-status" aria-live="polite"></p>
  </section>`;

/** Draws the ruler, the lanes and their bars and marks. Bars carry their index, so a click can find its step. */
export function drawTrace(root: HTMLElement, o: Trace) {
  const pct = (t: number) => `${(t / o.end) * 100}%`;
  const grid = root.querySelector<HTMLElement>('.tr-grid')!;
  grid.style.setProperty('--gx', pct(o.minor ?? o.every));
  const ticks = Array.from({ length: Math.floor(o.end / o.every) + 1 }, (_, k) =>
    `<span class="tr-tick" style="left:${pct(k * o.every)}">${k * o.every}</span>`).join('');
  grid.innerHTML = `<div class="tr-ruler" aria-hidden="true">${ticks}</div>${o.lanes.map((l) => `
    <div class="tr-lane${l.bus ? ' tr-bus' : ''}" data-lane="${l.id}" style="--lane:${l.color}">
      <span class="tr-label"><b>${esc(l.name)}</b><small>${l.sub}</small></span>
      <div class="tr-track">${o.bars.map((b, i) => b.lane === l.id
        ? `<span class="tr-seg k-${b.kind}" data-i="${i}" style="left:${pct(b.t0)};width:${pct(b.t1 - b.t0)}">${
          b.label ? `<em>${esc(b.label)}</em>` : ''}</span>` : '').join('')}${(o.marks ?? []).filter((m) => m.lane === l.id).map((m) =>
        `<span class="tr-mark m-${m.kind}" style="left:${pct(m.t)}" title="${esc(m.title)}"></span>`).join('')}</div>
    </div>`).join('')}<div class="tr-head" aria-hidden="true"></div>`;
}

/** Fills the readout above the lanes. */
export const readout = (root: HTMLElement, items: string[]) =>
  (root.querySelector('.tr-readout')!.innerHTML = items.map((r) => `<span>${r}</span>`).join(''));

/** Places the gold cursor at time `t`. It is a child of the grid, so it is placed from the first track's geometry. */
export function cursor(root: HTMLElement, t: number, end: number) {
  const track = root.querySelector<HTMLElement>('.tr-track');
  const head = root.querySelector<HTMLElement>('.tr-head');
  if (track && head) head.style.left = `${track.offsetLeft + (t / end) * track.offsetWidth}px`;
}

export interface Stepper {
  /** Shows step `i`. */
  go(i: number): void;
  /** Swaps in a new trace and its steps (after a setting changes) and shows step `i`. */
  load(t: Trace, steps: Step[], i?: number): void;
  readonly at: number;
}

/**
 * Runs the walkthrough: Back / Step / Play / Restart, clicking a bar, and the arrow keys. Each step lights its bar,
 * moves the cursor, lights the lane holding the CPU, fills the readout and the explain line, then calls `onStep`.
 */
export function stepper(root: HTMLElement, onStep?: (s: Step, i: number) => void): Stepper {
  let trace: Trace = { lanes: [], bars: [], end: 1, every: 1 };
  let steps: Step[] = [];
  let at = 0;
  let timer: number | undefined;
  const btn = (a: string) => root.querySelector<HTMLButtonElement>(`.trace [data-act="${a}"]`);

  function draw() {
    const s = steps[at];
    root.querySelectorAll('.tr-seg.active').forEach((e) => e.classList.remove('active'));
    root.querySelector(`.tr-seg[data-i="${s.bar}"]`)?.classList.add('active');
    cursor(root, s.at, trace.end);
    readout(root, s.readout);
    root.querySelector('.tr-status')!.innerHTML = `<b>Step ${at + 1} of ${steps.length}.</b> ${s.note}`;
    root.querySelectorAll<HTMLElement>('.tr-lane').forEach((l) => l.classList.toggle('on', l.dataset.lane === s.lane));
    btn('back')!.disabled = at === 0;
    btn('step')!.disabled = at === steps.length - 1;
    onStep?.(s, at);
  }

  // Play pauses on each step long enough to read it: a base time plus reading time for the text.
  const dwell = () => Math.min(8000, 1600 + steps[at].note.replace(/<[^>]+>/g, '').length * 42);
  const stop = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    btn('play')!.textContent = 'Play';
  };
  const tick = () => {
    if (at >= steps.length - 1) return stop();
    go(at + 1);
    timer = window.setTimeout(tick, dwell());
  };
  const go = (i: number) => { at = Math.max(0, Math.min(steps.length - 1, i)); draw(); };

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const bar = t.closest<HTMLElement>('.tr-seg');
    if (bar) {
      const i = steps.findIndex((s) => s.bar === Number(bar.dataset.i));
      if (i >= 0) { stop(); go(i); }
      return;
    }
    const act = t.closest<HTMLElement>('.trace [data-act]')?.dataset.act;
    if (act === 'step') { stop(); go(at + 1); }
    else if (act === 'back') { stop(); go(at - 1); }
    else if (act === 'restart') { stop(); go(0); }
    else if (act === 'play') {
      if (timer !== undefined) return stop();
      if (at === steps.length - 1) go(0);
      btn('play')!.textContent = 'Pause';
      timer = window.setTimeout(tick, dwell());
    }
  });
  root.querySelector('.trace')!.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if ((k === 'ArrowRight' || k === 'ArrowLeft') && !(e.target as Element).closest('input, select')) {
      e.preventDefault(); stop(); go(at + (k === 'ArrowRight' ? 1 : -1));
    }
  });
  let rt: number | undefined;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => steps.length && cursor(root, steps[at].at, trace.end), 100); });

  return {
    go: (i) => { stop(); go(i); },
    load(t, s, i = 0) { stop(); trace = t; steps = s; drawTrace(root, t); go(i); },
    get at() { return at; },
  };
}

/** A plural noun: 1 frame, 2 frames. */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
