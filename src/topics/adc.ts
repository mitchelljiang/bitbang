/**
 * ADC: a successive-approximation converter, as on most microcontrollers. It samples the input, then finds its code one
 * bit at a time, most significant first: set the bit, compare the input with the voltage that code stands for, keep the
 * bit if the input is at least that high. After N comparisons the code is the input's place on a scale of 2^N steps.
 * Step through the comparisons and watch the trial voltage close in on the input. `sar` is the search, exported with
 * the ideal transfer function `ideal` so the checks can compare them at every code.
 */
import { markSeg, seg, status, stepButtons, syncUrl, walkthrough } from './dbg';
import { eq } from './math';
import { waveHtml, type WaveLane } from './wave';

export interface SarStep { bit: number; trial: number; volts: number; keep: boolean }

/** The comparisons a SAR converter makes for input `vin` against reference `vref` at `n` bits, and the code it ends with. */
export function sar(vin: number, vref: number, n: number): { steps: SarStep[]; code: number } {
  const steps: SarStep[] = [];
  let code = 0;
  for (let bit = n - 1; bit >= 0; bit--) {
    const trial = code | (1 << bit);
    const volts = (trial * vref) / 2 ** n;
    const keep = vin >= volts;
    if (keep) code = trial;
    steps.push({ bit, trial, volts, keep });
  }
  return { steps, code };
}

/** The ideal converter: the input's fraction of the reference, in steps of vref / 2^n, rounded down and capped at full scale. */
export const ideal = (vin: number, vref: number, n: number) => Math.min(2 ** n - 1, Math.max(0, Math.floor((vin / vref) * 2 ** n)));

export const VREF = 3.3;
const INPUTS = ['0.42', '1.00', '1.65', '2.71'];
const BITS = ['4', '8', '12'];

export function mountAdc(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  let vin = INPUTS.includes(q.get('vin') ?? '') ? q.get('vin')! : '1.00';
  let n = BITS.includes(q.get('bits') ?? '') ? Number(q.get('bits')) : 8;
  let at = 0; // comparisons shown so far, 0 to n

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Analog</p>
      <h1>ADC</h1>
      <p>An analog-to-digital converter turns a voltage into a number. The one in most microcontrollers is a
        <b>successive-approximation</b> converter: it holds the input steady, then plays twenty questions with it, one
        bit per question, starting with the most significant. Each question sets a bit, turns the code so far into a
        voltage, and asks a comparator whether the input is at least that high. Pick an input and a resolution, then
        step through the comparisons.</p>
    </section>
    <section class="debugger mem periph adc" aria-label="Successive-approximation ADC">
      <header class="dbg-bar pf-bar">
        <span class="dbg-file">ADC1 · Vref 3.3 V</span>
        <div class="pf-ctls">
          <div class="pf-ctl"><span>Input</span>${seg('vin', 'Input voltage', INPUTS.map((v) => [v, `${v} V`]))}</div>
          <div class="pf-ctl"><span>Bits</span>${seg('bits', 'Resolution', BITS.map((v) => [v, v]))}</div>
        </div>
        <div class="dbg-controls">${stepButtons()}</div>
      </header>
      <div class="pf-screen">
        <div class="pf-readout"></div>
        <div class="pf-wave"></div>
        <div class="ad-reg"></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>A binary search in hardware</h2>
      <p>The first comparison asks whether the input is in the top half of the range, the next which quarter, and so on:
        each one halves what is left, so N bits take N comparisons, whatever the input. Inside, a small DAC makes the trial
        voltage from the code so far, usually by sharing charge between capacitors sized 1, 2, 4 and up, and one comparator
        answers each question. On an STM32F4 a 12-bit conversion takes 12 clock cycles for the comparisons, plus the
        sampling time you choose.</p>
      <h2>Resolution and the step size</h2>
      <p>The code counts steps of Vref / 2<sup>N</sup>: about 0.81 mV at 12 bits from 3.3 V, 12.9 mV at 8 bits. Every
        voltage within one step gives the same code, so an ideal converter is off by up to one step, the quantization
        error. Fewer bits convert faster and are enough for a battery level or a knob; audio and precise sensors want
        more. Real converters add a little offset, gain error and noise on top, which is why datasheets quote accuracy
        separately from resolution.</p>
      ${eq(String.raw`\mathrm{LSB} = \frac{V_{\mathrm{ref}}}{2^N} = \frac{3.3\,\mathrm{V}}{4096} \approx 0.81\,\mathrm{mV} \qquad \mathrm{code} = \left\lfloor \frac{V_{\mathrm{in}}}{\mathrm{LSB}} \right\rfloor`)}
      <h2>Sample, then hold</h2>
      <p>The comparisons take time, and the input must not move while they happen, or the later bits answer a different
        question from the earlier ones. So a conversion starts by connecting the input to a small capacitor for the
        sampling time, then disconnecting it and converting the voltage it holds. A source with a high resistance needs a
        longer sampling time to charge that capacitor fully. How often to sample is a separate question: a signal must be
        sampled more than twice as fast as its highest frequency, or it aliases. Finished conversions are usually moved
        out by an interrupt or by DMA.</p>
    </section>`;

  const walk = walkthrough(root, { count: () => n + 1, at: () => at, go: (i) => { at = i; draw(); } });

  function draw() {
    const v = Number(vin);
    const { steps, code } = sar(v, VREF, n);
    const shown = steps.slice(0, at);
    const cur = shown[shown.length - 1];
    const sofar = shown.reduce((c, s) => (s.keep ? s.trial : c), 0);
    const pts: [number, number][] = [[0, 0], ...shown.map((s, i): [number, number] => [i + 0.5, s.volts])];
    const lane: WaveLane = {
      name: 'Trial', sub: 'bit tried', color: 'var(--ch1)', y: [0, VREF], step: true, h: 190, pts,
      refs: [{ v: VREF, label: 'Vref 3.3 V' }, { v, label: `Vin ${vin} V`, color: 'var(--ch2)' }],
      dots: shown.map((s, i) => ({ t: i + 0.5, v: s.volts, cls: s.keep ? 'keep' : 'drop' })),
    };
    root.querySelector('.pf-wave')!.innerHTML = waveHtml({ lanes: [lane], end: n + 0.5, every: 1,
      ticks: steps.map((s, i) => ({ t: i + 0.5, label: String(s.bit) })) });
    const lsb = VREF / 2 ** n;
    root.querySelector('.pf-readout')!.innerHTML = at < n
      ? `<span>Code so far <b>${sofar}</b></span><span>Step <b>${(lsb * 1000).toFixed(2)} mV</b></span><span>Comparisons <b>${at} of ${n}</b></span>`
      : `<span>Result <b>${code}</b> of ${2 ** n - 1}</span><span>Means <b>${(code * lsb).toFixed(3)} V</b></span><span>Step <b>${(lsb * 1000).toFixed(2)} mV</b></span>`;
    root.querySelector('.ad-reg')!.innerHTML = `<span class="ad-name">DR</span>${Array.from({ length: n }, (_, i) => {
      const bit = n - 1 - i;
      const s = steps[i];
      const done = i < at;
      return `<span class="ad-bit${done ? (s.keep ? ' one' : ' zero') : ''}${i === at - 1 ? ' cur' : ''}"><b>${done ? (s.keep ? 1 : 0) : '·'}</b><small>${bit}</small></span>`;
    }).join('')}`;
    markSeg(root, 'vin', vin);
    markSeg(root, 'bits', String(n));
    status(root, !cur
      ? `The input is sampled and held at ${vin} V. Press Step: the converter will find its ${n}-bit code with ${n} comparisons, most significant bit first.`
      : at < n
        ? `Bit ${cur.bit}: try code ${cur.trial}, which stands for ${cur.volts.toFixed(3)} V. The input is ${cur.keep ? 'at least that high, so the bit stays 1' : 'lower, so the bit goes back to 0'}.`
        : `Bit ${cur.bit}: try ${cur.trial} (${cur.volts.toFixed(3)} V), ${cur.keep ? 'keep it' : 'clear it'}. Done: code ${code}, ${(code * lsb).toFixed(3)} V, within one ${(lsb * 1000).toFixed(2)} mV step below the ${vin} V input.`);
    walk.sync();
    syncUrl({ vin, bits: String(n) });
  }

  draw();
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.pf-bar [role=radio]');
    if (!b) return;
    if (b.dataset.vin) vin = b.dataset.vin;
    else if (b.dataset.bits) n = Number(b.dataset.bits);
    at = 0;
    draw();
  });
}
