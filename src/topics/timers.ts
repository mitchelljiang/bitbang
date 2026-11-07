/**
 * Timers: a general-purpose timer is a prescaler and a counter. The prescaler divides the timer clock by PSC + 1; each
 * of its ticks moves the counter up one, and when the counter has reached ARR the next tick wraps it to 0 and raises
 * an update event, the timer's interrupt. Pick PSC and ARR and watch the clocks, the counter and the update events on
 * the glass. `timer` is a tick-by-tick simulation, exported with the closed-form `updateHz` so the checks can hold one
 * against the other.
 */
import { markSeg, seg, status, syncUrl } from './dbg';
import { eq } from './math';
import { waveHtml, type WaveLane, type WaveMark } from './wave';

export interface TimerRun {
  /** The counter during each timer-clock cycle. */
  cnt: number[];
  /** Cycles that began with a prescaler tick (the counter clock). */
  tick: boolean[];
  /** Cycles that began with the counter wrapping from ARR to 0: an update event. */
  update: boolean[];
}

/**
 * Runs an up-counting timer for `clocks` cycles of its input clock. It starts with CNT = 0 and the prescaler cleared;
 * each later cycle begins with a clock edge, which advances the prescaler and, when it wraps, the counter.
 */
export function timer(psc: number, arr: number, clocks: number): TimerRun {
  const r: TimerRun = { cnt: [], tick: [], update: [] };
  let pc = 0, cnt = 0;
  for (let k = 0; k < clocks; k++) {
    let tick = false, update = false;
    // Cycle 0 is the starting state; every later cycle begins with an edge.
    if (k > 0 && pc === psc) {
      pc = 0;
      tick = true;
      if (cnt === arr) { cnt = 0; update = true; } else cnt++;
    } else if (k > 0) pc++;
    r.cnt.push(cnt); r.tick.push(tick); r.update.push(update);
  }
  return r;
}

/** Update events per second: the timer clock divided by the prescaler, then by the counter's ARR + 1 steps. */
export const updateHz = (clk: number, psc: number, arr: number) => clk / ((psc + 1) * (arr + 1));

export const CLK = 16e6; // the STM32F4's internal 16 MHz oscillator, its clock out of reset
const PSCS = [0, 1, 2, 3];
const ARRS = [3, 5, 7, 11];
export const WINDOW = 48;

/** A time the way a datasheet writes it. */
export const secs = (t: number) => t >= 1 ? `${+t.toFixed(3)} s` : t >= 1e-3 ? `${+(t * 1e3).toFixed(3)} ms` : t >= 1e-6 ? `${+(t * 1e6).toFixed(3)} µs` : `${+(t * 1e9).toFixed(1)} ns`;

/** A frequency the way a datasheet writes it. */
export const hz = (f: number) => f >= 1e6 ? `${+(f / 1e6).toFixed(3)} MHz` : f >= 1e3 ? `${+(f / 1e3).toFixed(2)} kHz` : `${+f.toFixed(2)} Hz`;

/** The lanes both timer pages draw: the timer clock, the prescaler's ticks and the counter. */
export function timerLanes(r: TimerRun, arr: number, refs: WaveLane['refs'] = []): WaveLane[] {
  const n = r.cnt.length;
  const clock: [number, number][] = [];
  for (let k = 0; k < n; k++) clock.push([k, 1], [k + 0.5, 0]);
  const pulse = (on: boolean[]) => on.flatMap((x, k): [number, number][] => x ? [[k, 1], [k + 0.5, 0]] : []);
  return [
    { name: 'CK_INT', sub: 'timer clock', color: 'var(--ch4)', digital: true, pts: clock },
    { name: 'CK_CNT', sub: 'prescaler out', color: 'var(--ch2)', digital: true, pts: [[0, 0], ...pulse(r.tick)] },
    { name: 'CNT', sub: 'counter', color: 'var(--ch5)', y: [0, arr], step: true, pts: r.cnt.map((c, k): [number, number] => [k, c]),
      refs: [{ v: arr, label: `ARR ${arr}` }, ...refs] },
  ];
}

export function mountTimers(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  const pick = (k: string, all: number[], d: number) => { const v = Number(q.get(k)); return all.includes(v) && q.get(k) !== null ? v : d; };
  let psc = pick('psc', PSCS, 1), arr = pick('arr', ARRS, 5);

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Time</p>
      <h1>Timers</h1>
      <p>A timer counts clock edges. A prescaler divides the clock first, then a counter steps up once per tick until it
        reaches the value in its auto-reload register, ARR, wraps to zero and raises an <b>update event</b>. That event is
        what fires a periodic interrupt, and the rate is set entirely by two numbers. Pick them below; each lane is one
        signal inside the timer, one clock cycle per column.</p>
    </section>
    <section class="debugger mem periph timers" aria-label="Timer counter">
      <header class="dbg-bar pf-bar">
        <span class="dbg-file">TIM2 · up-counting</span>
        <div class="pf-ctls">
          <div class="pf-ctl"><span>PSC</span>${seg('psc', 'Prescaler', PSCS.map((v) => [String(v), String(v)]))}</div>
          <div class="pf-ctl"><span>ARR</span>${seg('arr', 'Auto-reload', ARRS.map((v) => [String(v), String(v)]))}</div>
        </div>
      </header>
      <div class="pf-screen">
        <div class="pf-readout"></div>
        <div class="pf-wave"></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Two dividers in a row</h2>
      <p>The prescaler counts timer-clock edges from 0 to PSC and then ticks the counter once, so it divides by PSC + 1.
        The counter counts ticks from 0 to ARR and then wraps, so it divides by ARR + 1. An update happens every
        (PSC + 1) × (ARR + 1) clocks. The +1s matter: the registers hold the last value counted, not the number of steps,
        which is why a 1 kHz tick from 16 MHz is PSC = 15 and ARR = 999, not 16 and 1000.</p>
      ${eq(String.raw`f_{\mathrm{update}} = \frac{f_{\mathrm{clk}}}{(\mathrm{PSC} + 1)(\mathrm{ARR} + 1)} \qquad T = \frac{1}{f_{\mathrm{update}}}`)}
      <h2>Real numbers</h2>
      <p>The same arithmetic covers any rate. From the 16 MHz clock, PSC = 15999 gives a 1 kHz counter and ARR = 999 makes
        it overflow once a second. On a chip clocked at 84 MHz, PSC = 8399 and ARR = 9999 does the same. Both registers
        are 16 bits wide on most timers, 32 bits for the counter on TIM2 and TIM5, so a slower clock or a longer period
        means a larger prescaler, at the cost of coarser steps. The counter's value is also a clock in its own right:
        reading CNT tells you how many ticks have passed since the last update, which is how code measures short
        intervals without an interrupt.</p>
      ${eq(String.raw`\frac{16\,\mathrm{MHz}}{(15999 + 1)(999 + 1)} = 1\,\mathrm{Hz} \qquad \frac{84\,\mathrm{MHz}}{(8399 + 1)(9999 + 1)} = 1\,\mathrm{Hz}`)}
      <h2>Changing ARR on the fly</h2>
      <p>ARR and PSC are buffered: with auto-reload preload on (ARPE in CR1), a write lands in a shadow register and only
        takes effect at the next update event, so a period never ends early or runs past a value already passed. Without
        it, writing an ARR below the current count makes the counter run all the way to its maximum before it wraps. The
        same counter, compared against a second register, makes a square wave: that is
        <a href="?p=pwm" data-nav>PWM</a>. The update event drives an interrupt like any other; see
        <a href="?p=interrupts" data-nav>Interrupts</a>.</p>
    </section>`;

  function draw() {
    const r = timer(psc, arr, WINDOW);
    const period = (psc + 1) * (arr + 1);
    const lanes = timerLanes(r, arr);
    lanes.push({ name: 'UEV', sub: 'update event', color: 'var(--ch1)', digital: true, pts: [[0, 0], ...r.update.flatMap((x, k): [number, number][] => x ? [[k, 1], [k + 0.5, 0]] : [])] });
    const marks: WaveMark[] = r.update.flatMap((x, k) => x ? [{ t: k }] : []);
    root.querySelector('.pf-wave')!.innerHTML = waveHtml({ lanes, end: WINDOW, every: 8, unit: 'clocks', marks });
    const f = updateHz(CLK, psc, arr);
    root.querySelector('.pf-readout')!.innerHTML = `<span>Update every <b>${period}</b> clocks</span><span>Rate <b>${hz(f)}</b></span><span>Period <b>${secs(1 / f)}</b></span>`;
    markSeg(root, 'psc', String(psc));
    markSeg(root, 'arr', String(arr));
    status(root, `The prescaler ticks once every ${psc + 1} clock${psc ? 's' : ''}${psc ? '' : ', so it passes every edge through'}. The counter steps 0, 1, … ${arr}, then wraps to 0 on the next tick and raises an update event: ${arr + 1} ticks × ${psc + 1} = every ${period} clocks, ${hz(updateHz(CLK, psc, arr))} from a 16 MHz clock.`);
    syncUrl({ psc: String(psc), arr: String(arr) });
  }

  draw();
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.pf-bar [role=radio]');
    if (!b) return;
    if (b.dataset.psc) psc = Number(b.dataset.psc);
    else if (b.dataset.arr) arr = Number(b.dataset.arr);
    draw();
  });
}
