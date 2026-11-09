/**
 * Debouncing: a button's contacts bounce for a few milliseconds when pressed or released, so the pin changes many times
 * for one press. The page plays one press-and-release, with an optional noise spike while the button is held, through
 * three readers: none (count every falling edge), a lockout (take the first edge, then ignore the pin for N ms), and a
 * counter (sample every millisecond, change only after N samples in a row agree). Each is exported with the raw signal
 * so the checks can count presses and latencies against hand-worked values.
 */
import { markSeg, seg, status, syncUrl } from './dbg';
import { eq } from './math';
import { waveHtml, waveScreen, type WaveLane, type WaveMark } from './wave';

/** The pin, as (time in ms, level) edges. It idles high on a pull-up; pressing connects it to ground. */
const PRESS: [number, number][] = [[0, 1], [7.6, 0], [8.2, 1], [8.4, 0], [9.7, 1], [11.6, 0], [12.1, 1], [12.3, 0]];
const RELEASE: [number, number][] = [[38.0, 1], [38.3, 0], [38.9, 1], [39.6, 0], [40.4, 1]];
/** A brief spike while the button is held, such as a nearby motor switching. */
const SPIKE: [number, number][] = [[25.2, 1], [25.5, 0]];
export const END = 50;

export const raw = (noise: boolean) => [...PRESS, ...(noise ? SPIKE : []), ...RELEASE];
/** The pin's level at time t. */
export const levelAt = (edges: [number, number][], t: number) => edges.reduce((v, [et, ev]) => (et <= t ? ev : v), 1);

export type Method = 'none' | 'lockout' | 'counter';
export interface Result { out: [number, number][]; presses: number[] }

/** No debouncing: an interrupt on every falling edge counts a press. */
export function none(edges: [number, number][]): Result {
  return { out: edges, presses: edges.filter(([, v], i) => i > 0 && v === 0).map(([t]) => t) };
}

/** Lockout: take an edge at once, then ignore the pin for n ms; when the lockout ends, read the pin and catch up. */
export function lockout(edges: [number, number][], n: number): Result {
  const out: [number, number][] = [[0, 1]];
  let v = 1, until = -1;
  const set = (t: number, x: number) => { v = x; out.push([t, x]); until = t + n; };
  for (const [t, x] of edges.slice(1)) {
    // A lockout that ended before this edge: the pin is read then, and a change it missed is taken.
    while (until >= 0 && until <= t && levelAt(edges, until) !== v) set(until, levelAt(edges, until));
    if (t >= until && x !== v) set(t, x);
  }
  while (until >= 0 && until <= END && levelAt(edges, until) !== v) set(until, levelAt(edges, until));
  return { out, presses: out.filter(([, x], i) => i > 0 && x === 0).map(([t]) => t) };
}

/** Counter: sample every 1 ms and change only after n samples in a row differ from the current output. */
export function counter(edges: [number, number][], n: number): Result {
  const out: [number, number][] = [[0, 1]];
  let v = 1, run = 0;
  for (let t = 0; t <= END; t++) {
    const s = levelAt(edges, t);
    run = s === v ? 0 : run + 1;
    if (run >= n) { v = s; run = 0; out.push([t, v]); }
  }
  return { out, presses: out.filter(([, x], i) => i > 0 && x === 0).map(([t]) => t) };
}

const NS = ['2', '5', '10'];

export function mountDebounce(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  let method: Method = (['none', 'lockout', 'counter'] as const).find((m) => m === q.get('m')) ?? 'none';
  let n = NS.includes(q.get('n') ?? '') ? Number(q.get('n')) : 5;
  let noise = q.get('noise') === '1';

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Pins</p>
      <h1>Debouncing</h1>
      <p>A button is two pieces of metal pushed together, and they do not meet cleanly: they touch, spring apart and touch
        again for a few milliseconds. To the pin, one press looks like a burst of presses. Debouncing is how firmware turns
        that burst back into one. Below is one press and release on a pin with a pull-up, so it reads 0 while pressed.
        Pick a way to read it and count the presses it sees.</p>
    </section>
    <section class="debugger mem periph debounce" aria-label="Button debouncing">
      <header class="dbg-bar pf-bar">
        <span class="dbg-file">PB0 · button to ground</span>
        <div class="pf-ctls">
          <div class="pf-ctl"><span>Method</span>${seg('m', 'Debounce method', [['none', 'None'], ['lockout', 'Lockout'], ['counter', 'Counter']])}</div>
          <div class="pf-ctl"><span>N</span>${seg('n', 'Debounce time', NS.map((v) => [v, `${v} ms`]))}</div>
          <div class="pf-ctl"><span>Noise</span>${seg('noise', 'Noise spike', [['0', 'Off'], ['1', 'On']])}</div>
        </div>
      </header>
      ${waveScreen()}
    </section>
    <section class="prose">
      <h2>Why contacts bounce</h2>
      <p>The moving contact in a switch is a small spring. When it hits the fixed contact it rebounds a few times before
        it settles, typically for 1 to 10 ms, and often less cleanly on release than on press. An interrupt on every
        falling edge sees each rebound as a new press, which is why a counter wired straight to a button jumps by three
        or four. Faster microcontrollers make this worse, not better: they are quick enough to catch every bounce.</p>
      <h2>Lockout: fast, but trusts every edge</h2>
      <p>The simplest fix takes the first edge as the press, then ignores the pin for longer than any bounce, and reads
        it again at the end. It reacts at once, with no delay. But it believes any edge, so a short spike of noise while
        the button is held looks like a release and a second press. Choose N longer than the worst bounce: here the
        press bounces for 4.7 ms, so a 2 ms lockout ends in the middle of it.</p>
      <h2>Counter: waits until the pin agrees</h2>
      <p>The counter samples the pin on a timer tick, here every millisecond, and changes its answer only after N samples
        in a row disagree with it. A spike shorter than the sample interval is never seen, and one that is seen resets
        the count. The cost is latency: the press is reported N ms after the pin settles. With N = 5 that is
        imperceptible; with N = 10 a fast double-press can start to merge. The time a press takes to register is</p>
      ${eq(String.raw`t_{\mathrm{press}} = t_{\mathrm{settle}} + N \cdot t_{\mathrm{sample}}`)}
      <p>Hardware can help too: a capacitor across the button and a resistor in series form a low-pass filter that
        smooths the bounce, and a Schmitt-trigger input, which most GPIO inputs have, ignores the slow, noisy middle of
        the transition. See <a href="?p=gpio" data-nav>GPIO</a> for the pull-up the button needs.</p>
    </section>`;

  function draw() {
    const edges = raw(noise);
    const r = method === 'none' ? none(edges) : method === 'lockout' ? lockout(edges, n) : counter(edges, n);
    const samples = method === 'counter' ? Array.from({ length: END + 1 }, (_, t) => ({ t, v: levelAt(edges, t), cls: '' })) : [];
    const lanes: WaveLane[] = [
      { name: 'Pin', sub: 'raw level', color: 'var(--ch2)', digital: true, h: 54, pts: edges, dots: samples },
      { name: 'Button', sub: method === 'none' ? 'every edge' : `${method}, ${n} ms`, color: 'var(--ch5)', digital: true, h: 54, pts: r.out },
    ];
    const marks: WaveMark[] = r.presses.map((t) => ({ t, cls: r.presses.length > 1 ? 'bad' : '' }));
    root.querySelector('.pf-wave')!.innerHTML = waveHtml({ lanes, end: END, every: 5, unit: 'ms', marks });
    root.querySelector('.pf-readout')!.innerHTML = `<span>Presses counted <b class="${r.presses.length === 1 ? 'good' : 'bad'}">${r.presses.length}</b></span><span>Registered at <b>${r.presses.length ? `${r.presses[0]} ms` : '—'}</b></span>`;
    markSeg(root, 'm', method);
    markSeg(root, 'n', String(n));
    markSeg(root, 'noise', noise ? '1' : '0');
    root.querySelectorAll<HTMLButtonElement>('[data-n]').forEach((b) => (b.disabled = method === 'none'));
    status(root, explain(method, n, noise, r));
    syncUrl({ m: method, n: String(n), noise: noise ? '1' : '0' });
  }

  draw();
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.pf-bar [role=radio]');
    if (!b) return;
    if (b.dataset.m) method = b.dataset.m as Method;
    else if (b.dataset.n) n = Number(b.dataset.n);
    else if (b.dataset.noise) noise = b.dataset.noise === '1';
    draw();
  });
}

function explain(method: Method, n: number, noise: boolean, r: Result) {
  const k = r.presses.length;
  if (method === 'none') return `Every falling edge counts, so one press is counted <b>${k} times</b>: the press bounces four times and the release twice${noise ? ', and the spike adds one more' : ''}. Pick Lockout or Counter.`;
  if (method === 'lockout') {
    if (k === 1) return `The first edge, at 7.6 ms, is taken at once and the pin is ignored for ${n} ms, longer than the 4.7 ms bounce. <b>One press</b>, with no delay. Turn the noise on to see its weakness.`;
    if (noise && n >= 5) return `The press is clean, but the spike at 25.2 ms is an edge like any other: the lockout takes it as a release, and when it ends the pin reads 0 again, a <b>second press</b>. A lockout trusts every edge.`;
    return `A ${n} ms lockout ends at ${(7.6 + n).toFixed(1)} ms, while the contacts are still bouncing, so the next edge is taken as a release and a new press: <b>${k} presses</b>. N must be longer than the worst bounce.`;
  }
  if (k === 1) return `The pin is sampled every millisecond, and the answer changes only after ${n} samples in a row disagree. The bounce never lasts that long${noise ? ', and the spike falls between samples' : ''}: <b>one press</b>, registered at ${r.presses[0]} ms, ${n} ms after the pin settles.`;
  return `Samples at 8 and 9 ms both read 0, which is ${n} in a row, so a press is reported; then 10 and 11 ms read 1 and it is undone. Two samples is shorter than the bounce: <b>${k} presses</b>. Raise N.`;
}
