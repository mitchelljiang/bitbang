/**
 * Watchdog: the STM32's independent watchdog (IWDG) counts down from its reload value on its own slow clock; the main
 * loop must write the refresh key before it reaches zero, or the chip resets. Pick how often the loop kicks it, or make
 * the loop hang, and watch the counter, the kicks and the reset. `timeoutMs` is the reference manual's formula and `run`
 * a tick-by-tick simulation, so the checks can hold one against the other.
 */
import { markSeg, seg, status, syncUrl } from './dbg';
import { eq } from './math';
import { waveHtml, type WaveLane, type WaveMark } from './wave';

/** The IWDG timeout: the 32 kHz LSI divided by 4 × 2^PR, counted down from RLR to 0 (RM0090, independent watchdog). */
export const timeoutMs = (pr: number, rlr: number, lsiHz = 32_000) => ((4 * 2 ** pr * (rlr + 1)) / lsiHz) * 1000;

/** The page's setting: prescaler /4 (PR = 0), so one count is 0.125 ms, and RLR = 399: 50 ms. */
export const PR = 0, RLR = 399, TIMEOUT = timeoutMs(PR, RLR);
export const END = 200;
const STEP = 0.125; // ms per watchdog count at /4

export interface Run { cnt: [number, number][]; kicks: number[]; resets: number[] }

/**
 * Simulates the counter for `end` ms. The loop kicks every `every` ms until it hangs at `hang` ms (never kicks again);
 * a kick reloads the counter to RLR; reaching 0 resets the chip, which restarts the watchdog and the loop.
 */
export function run(every: number, hang = Infinity, end = END): Run {
  const r: Run = { cnt: [[0, RLR]], kicks: [], resets: [] };
  let c = RLR, boot = 0, next = every;
  for (let k = 1; k * STEP <= end + 1e-9; k++) {
    const t = +(k * STEP).toFixed(3);
    if (t >= next - 1e-9 && t - boot < hang) { r.cnt.push([t, c]); c = RLR; r.kicks.push(t); r.cnt.push([t, c]); next += every; continue; }
    // RLR + 1 counts reach the end: from RLR down through 0, and the next count resets the chip.
    c--;
    if (c < 0) { r.resets.push(t); r.cnt.push([t, 0]); c = RLR; boot = t; next = t + every; r.cnt.push([t, c]); continue; }
    if (k % 8 === 0) r.cnt.push([t, c]);
  }
  return r;
}

const EVERY = ['20', '45', '60'];

export function mountWatchdog(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  let every = EVERY.includes(q.get('every') ?? '') ? Number(q.get('every')) : 20;
  let hang = q.get('hang') === '1';

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Time</p>
      <h1>Watchdog</h1>
      <p>A watchdog is a timer that resets the chip unless the program keeps telling it everything is fine. It counts
        down on its own clock; the main loop writes a key to reload it, a <b>kick</b>, each time round. If the loop
        hangs, or runs too slowly, the counter reaches zero and the chip restarts, which is usually better than sitting
        stuck. Here the watchdog times out after 50 ms. Pick how often the loop kicks it, or make it hang.</p>
    </section>
    <section class="debugger mem periph watchdog" aria-label="Independent watchdog">
      <header class="dbg-bar pf-bar">
        <span class="dbg-file">IWDG · /4 · RLR ${RLR}</span>
        <div class="pf-ctls">
          <div class="pf-ctl"><span>Kick every</span>${seg('every', 'Kick interval', EVERY.map((v) => [v, `${v} ms`]))}</div>
          <div class="pf-ctl"><span>Loop</span>${seg('hang', 'Main loop', [['0', 'Runs'], ['1', 'Hangs at 70 ms']])}</div>
        </div>
      </header>
      <div class="pf-screen">
        <div class="pf-readout"></div>
        <div class="pf-wave"></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Counting down on its own clock</h2>
      <p>The independent watchdog runs from the LSI, a separate 32 kHz oscillator inside the chip, so it keeps counting
        even if the main clock fails or the code has turned it off by mistake. It divides the LSI by a prescaler, then
        counts down from the reload register, RLR, to zero. Writing 0xAAAA to its key register reloads the counter; that is
        the kick. Once started, with 0xCCCC, it cannot be stopped until the next reset. The timeout is</p>
      ${eq(String.raw`t_{\mathrm{out}} = \frac{4 \cdot 2^{\mathrm{PR}} \cdot (\mathrm{RLR} + 1)}{f_{\mathrm{LSI}}} = \frac{4 \cdot 1 \cdot 400}{32\,\mathrm{kHz}} = 50\,\mathrm{ms}`)}
      <p>The longest, with the /256 prescaler and RLR = 4095, is about 32.8 s. The LSI is not precise, anywhere from 17
        to 47 kHz on an STM32F4, so choose a timeout with plenty of margin over the slowest normal loop.</p>
      <h2>Where to kick</h2>
      <p>Kick from one place in the main loop, after the work that proves the program is healthy, never from a timer
        interrupt: an interrupt keeps firing even while the main loop is stuck, and the watchdog would never notice. On
        an RTOS, each task reports in and a supervisor kicks only when all of them have. After a watchdog reset, firmware
        can read the reset-cause flags (IWDGRSTF in RCC_CSR) to log what happened instead of restarting silently.</p>
      <h2>The window watchdog</h2>
      <p>The STM32 also has a window watchdog, WWDG, which resets the chip if it is kicked too late or too early. A kick
        that comes too soon means the loop is skipping work, a fault the independent watchdog cannot see. The cost is a
        tighter timing budget, and it runs from the main clock.</p>
    </section>`;

  function draw() {
    const r = run(every, hang ? 70 : Infinity);
    const lanes: WaveLane[] = [
      { name: 'Kick', sub: 'IWDG_KR = 0xAAAA', color: 'var(--ch2)', digital: true, h: 44,
        pts: [[0, 0], ...r.kicks.flatMap((t): [number, number][] => [[t, 1], [t + 1.2, 0]])] },
      { name: 'Counter', sub: 'counts down', color: 'var(--ch5)', y: [0, RLR], h: 130, pts: r.cnt,
        refs: [{ v: RLR, label: `RLR ${RLR}` }, { v: 0, label: 'reset at 0', color: '#ff7b66' }] },
      { name: 'Reset', sub: 'NRST', color: '#ff7b66', digital: true, h: 44,
        pts: [[0, 0], ...r.resets.flatMap((t): [number, number][] => [[t, 1], [t + 1.2, 0]])] },
    ];
    const marks: WaveMark[] = r.resets.map((t) => ({ t, cls: 'bad' }));
    root.querySelector('.pf-wave')!.innerHTML = waveHtml({ lanes, end: END, every: 20, unit: 'ms', marks });
    root.querySelector('.pf-readout')!.innerHTML = `<span>Timeout <b>${TIMEOUT} ms</b></span><span>Kicks <b>${r.kicks.length}</b></span><span>Resets <b class="${r.resets.length ? 'bad' : 'good'}">${r.resets.length}</b></span>`;
    markSeg(root, 'every', String(every));
    markSeg(root, 'hang', hang ? '1' : '0');
    const first = r.resets[0];
    status(root, !first
      ? `The loop kicks every ${every} ms, well inside the 50 ms timeout, so the counter is reloaded long before it reaches zero. <b>No reset.</b>`
      : hang && (every < TIMEOUT)
        ? `The loop kicks every ${every} ms until it hangs at 70 ms. With no more kicks the counter runs down and reaches zero 50 ms after the last kick: <b>reset at ${first} ms</b>. The chip restarts, the loop runs again, and hangs again.`
        : `A kick every ${every} ms is slower than the 50 ms timeout, so the counter reaches zero first: <b>reset at ${first} ms</b>, before the loop ever kicks. A healthy but slow loop is reset just like a stuck one; raise the timeout or kick sooner.`);
    syncUrl({ every: String(every), hang: hang ? '1' : '0' });
  }

  draw();
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.pf-bar [role=radio]');
    if (!b) return;
    if (b.dataset.every) every = Number(b.dataset.every);
    else if (b.dataset.hang) hang = b.dataset.hang === '1';
    draw();
  });
}
