/**
 * DAC: a digital-to-analog converter turns a code into a voltage, a fixed fraction of the reference. A timer triggers
 * it at a steady rate and each trigger loads the next code from a table, so a list of numbers becomes a waveform: a
 * staircase that a simple RC filter smooths into the curve it stands for. Pick the shape, the resolution, the number of
 * samples per period and the filter. `volts`, `table` and `rc` are exported for the checks.
 */
import { markSeg, seg, status, syncUrl } from './dbg';
import { eq } from './math';
import { hz } from './timers';
import { waveHtml, type WaveLane } from './wave';

export const VREF = 3.3;
/** The output for a code at n bits: the reference times code / 2^n (RM0090: DAC_OUT = VREF+ × DOR / 4096 at 12 bits). */
export const volts = (code: number, n: number) => (VREF * code) / 2 ** n;

export type Shape = 'sine' | 'triangle';
/** The ideal signal at phase p (0 to 1): 0.45 V to 2.85 V around mid-rail, inside every resolution's top code. */
export const ideal = (shape: Shape, p: number) => 1.65 + 1.2 * (shape === 'sine' ? Math.sin(2 * Math.PI * p) : 1 - 4 * Math.abs(((p + 0.25) % 1) - 0.5));
/** The code table for one period: each sample's ideal voltage, rounded to the nearest of 2^n steps. */
export const table = (shape: Shape, n: number, samples: number) =>
  Array.from({ length: samples }, (_, k) => Math.min(2 ** n - 1, Math.round((ideal(shape, k / samples) / VREF) * 2 ** n)));

/**
 * A first-order RC low-pass driven by a staircase, solved exactly over each step: the output moves toward the input by
 * 1 − e^(−t/τ). `levels` holds one input voltage per step of length `dt`; `sub` points are returned per step.
 */
export function rc(levels: number[], dt: number, tau: number, sub = 8, y0 = levels[0]): [number, number][] {
  const out: [number, number][] = [[0, y0]];
  let y = y0;
  levels.forEach((x, k) => {
    const start = y;
    for (let j = 1; j <= sub; j++) { y = x + (start - x) * Math.exp(-(j * dt) / sub / tau); out.push([k * dt + (j * dt) / sub, y]); }
  });
  return out;
}

export const F_TRIG = 100_000; // the timer triggers a conversion every 10 µs
const DT = 1e6 / F_TRIG; // µs per sample
const BITS = ['3', '6', '12'];
const SAMPLES = ['8', '16', '32'];

export function mountDac(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  let shape: Shape = q.get('shape') === 'triangle' ? 'triangle' : 'sine';
  let n = BITS.includes(q.get('bits') ?? '') ? Number(q.get('bits')) : 3;
  let samples = SAMPLES.includes(q.get('s') ?? '') ? Number(q.get('s')) : 16;
  let filter = q.get('rc') !== '0';

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Analog</p>
      <h1>DAC</h1>
      <p>A digital-to-analog converter is the <a href="?p=adc" data-nav>ADC</a> run backwards: write a number and the pin
        moves to that fraction of the reference voltage. Feed it a new number at a steady rate and a table of numbers
        becomes a waveform. What comes out is a staircase, one step per sample, and a resistor and capacitor on the pin
        smooth it into the curve it stands for. Pick a shape, how finely each sample is rounded, and how many samples
        make one period.</p>
    </section>
    <section class="debugger mem periph dac" aria-label="DAC waveform">
      <header class="dbg-bar pf-bar">
        <span class="dbg-file">DAC1 · 100 kHz trigger</span>
        <div class="pf-ctls">
          <div class="pf-ctl"><span>Shape</span>${seg('shape', 'Waveform', [['sine', 'Sine'], ['triangle', 'Triangle']])}</div>
          <div class="pf-ctl"><span>Bits</span>${seg('bits', 'Resolution', BITS.map((v) => [v, v]))}</div>
          <div class="pf-ctl"><span>Samples</span>${seg('s', 'Samples per period', SAMPLES.map((v) => [v, v]))}</div>
          <div class="pf-ctl"><span>RC filter</span>${seg('rc', 'Output filter', [['0', 'Off'], ['1', 'On']])}</div>
        </div>
      </header>
      <div class="pf-screen">
        <div class="pf-readout"></div>
        <div class="pf-wave"></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>A code becomes a fraction of the reference</h2>
      <p>Inside, a resistor ladder or a set of switched current sources adds up one share of the reference voltage for
        each bit that is set: half for the top bit, a quarter for the next, and so on. The STM32F4's DAC is 12 bits wide,
        so it has 4096 steps of about 0.81 mV from 3.3 V. The page also rounds to 3 or 6 bits, to make the steps big
        enough to see.</p>
      ${eq(String.raw`V_{\mathrm{out}} = V_{\mathrm{ref}} \cdot \frac{\mathrm{DOR}}{2^N} \qquad \frac{3.3\,\mathrm{V} \cdot 2048}{4096} = 1.65\,\mathrm{V}`)}
      <h2>Timer, table and DMA</h2>
      <p>To make a waveform, a timer triggers the DAC at a fixed rate and, on each trigger, DMA copies the next code from a
        table in memory into the DAC's data register, with no work for the CPU. The table holds one period, and DMA in
        circular mode runs through it forever. The output frequency is the trigger rate divided by the table length, so
        fewer samples give a higher frequency but a coarser shape:</p>
      ${eq(String.raw`f_{\mathrm{out}} = \frac{f_{\mathrm{trigger}}}{N_{\mathrm{samples}}} = \frac{100\,\mathrm{kHz}}{16} = 6.25\,\mathrm{kHz}`)}
      <h2>Smoothing the steps</h2>
      <p>The steps carry energy at the sample rate and its multiples, far above the signal itself, so a low-pass filter
        removes them. A single resistor and capacitor is the simplest; its time constant, τ = RC, here equals one sample
        period. Each step moves the output toward its new level by 63% in one τ. A gentle filter like this rounds the
        steps but also lags the signal and shrinks it a little; more samples per period, or a sharper filter, do better.
        Audio DACs sample far faster than the signal for exactly this reason.</p>
      ${eq(String.raw`v(t) = V_{\mathrm{step}} + (v_0 - V_{\mathrm{step}})\, e^{-t/RC}`)}
    </section>`;

  function draw() {
    const codes = table(shape, n, samples);
    const levels = [...codes, ...codes].map((c) => volts(c, n));
    const end = levels.length * DT;
    const ghost = Array.from({ length: 2 * samples * 8 + 1 }, (_, j): [number, number] => [(j * DT) / 8, ideal(shape, j / 8 / samples)]);
    const lane: WaveLane = {
      name: 'DAC_OUT', sub: filter ? 'pin, then filtered' : 'pin', color: 'var(--ch4)', y: [0, VREF], h: 220, step: true,
      pts: levels.map((v, k): [number, number] => [k * DT, v]), ghost,
      extra: filter ? { pts: rc(levels, DT, DT), color: 'var(--ch3)' } : undefined,
      refs: [{ v: VREF, label: '3.3 V' }, { v: 0, label: '0 V' }],
    };
    root.querySelector('.pf-wave')!.innerHTML = waveHtml({ lanes: [lane], end, every: end > 400 ? 80 : 40, unit: 'µs' });
    const lsb = VREF / 2 ** n;
    const worst = Math.max(...codes.map((c, k) => Math.abs(volts(c, n) - ideal(shape, k / samples))));
    root.querySelector('.pf-readout')!.innerHTML = `<span>Output <b>${hz(F_TRIG / samples)}</b></span><span>Step <b>${lsb >= 0.01 ? `${lsb.toFixed(3)} V` : `${(lsb * 1000).toFixed(2)} mV`}</b></span><span>Worst rounding <b>${(worst * 1000).toFixed(1)} mV</b></span>`;
    markSeg(root, 'shape', shape);
    markSeg(root, 'bits', String(n));
    markSeg(root, 's', String(samples));
    markSeg(root, 'rc', filter ? '1' : '0');
    status(root, `${samples} samples per period at 100 kHz make a ${hz(F_TRIG / samples)} ${shape}. Each sample is rounded to one of ${2 ** n} steps of ${lsb >= 0.01 ? `${lsb.toFixed(3)} V` : `${(lsb * 1000).toFixed(2)} mV`}, so the blue staircase is never more than half a step from the dashed ideal.${filter ? ' The pink line is the pin after the RC filter: the corners are gone, at the cost of a small lag.' : ' Turn the RC filter on to smooth the steps.'}`);
    syncUrl({ shape, bits: String(n), s: String(samples), rc: filter ? '1' : '0' });
  }

  draw();
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.pf-bar [role=radio]');
    if (!b) return;
    const d = b.dataset;
    if (d.shape) shape = d.shape as Shape;
    else if (d.bits) n = Number(d.bits);
    else if (d.s) samples = Number(d.s);
    else if (d.rc) filter = d.rc === '1';
    draw();
  });
}
