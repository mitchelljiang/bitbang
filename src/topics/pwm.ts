/**
 * PWM: the timer's counter compared against a capture/compare register, CCR. In PWM mode 1 the output is high while
 * CNT < CCR and low for the rest of the period, so CCR / (ARR + 1) of every period is high: the duty cycle. Pick CCR and
 * the mode and watch the output and an LED's apparent brightness. `oc` is the reference manual's rule, `duty` the
 * closed form; the checks run one against the other.
 */
import { markSeg, seg, status, syncUrl } from './dbg';
import { eq } from './math';
import { CLK, hz, timer, timerLanes } from './timers';
import { waveHtml } from './wave';

export type PwmMode = 1 | 2;

/** OCxREF for one counter value (RM0090, up-counting): mode 1 is active while CNT < CCR, mode 2 is the inverse. */
export const oc = (mode: PwmMode, cnt: number, ccr: number): 0 | 1 => ((cnt < ccr) === (mode === 1) ? 1 : 0);

/** The fraction of a period the output is high. CCR above ARR holds mode 1 high all the time; CCR = 0 holds it low. */
export const duty = (mode: PwmMode, ccr: number, arr: number) => {
  const d = Math.min(Math.max(ccr / (arr + 1), 0), 1);
  return mode === 1 ? d : 1 - d;
};

export const ARR = 9;
const CCRS = [0, 2, 5, 8, 10];
const PERIODS = 3;
const VDD = 3.3;

export function mountPwm(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  let ccr = CCRS.includes(Number(q.get('ccr'))) && q.get('ccr') !== null ? Number(q.get('ccr')) : 2;
  let mode: PwmMode = q.get('mode') === '2' ? 2 : 1;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Time</p>
      <h1>PWM</h1>
      <p>Pulse-width modulation makes an output that is high for a chosen fraction of every period. A timer does it with
        no help from the CPU: the counter runs from 0 to ARR as on the <a href="?p=timers" data-nav>Timers</a> page, and a
        compare register, CCR, decides where in each period the output switches. Averaged over a period, the pin looks
        like a voltage between 0 and 3.3 V, which is how a microcontroller dims an LED or sets a motor's speed. Here ARR is
        ${ARR}, so each period is ${ARR + 1} counts.</p>
    </section>
    <section class="debugger mem periph pwm" aria-label="PWM output">
      <header class="dbg-bar pf-bar">
        <span class="dbg-file">TIM3 · channel 1</span>
        <div class="pf-ctls">
          <div class="pf-ctl"><span>CCR</span>${seg('ccr', 'Compare value', CCRS.map((v) => [String(v), String(v)]))}</div>
          <div class="pf-ctl"><span>Mode</span>${seg('mode', 'PWM mode', [['1', 'PWM 1'], ['2', 'PWM 2']])}</div>
        </div>
      </header>
      <div class="pf-screen">
        <div class="pf-readout"></div>
        <div class="pf-wave"></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Compare, then switch</h2>
      <p>Every counter tick, the channel compares CNT with CCR. In PWM mode 1 the output is active while CNT is below
        CCR and inactive from the match until the counter wraps, so it is high for CCR counts out of ARR + 1. PWM mode 2
        is the same comparison with the output inverted. The two ends behave sensibly: CCR = 0 never goes high, and any
        CCR above ARR never goes low, so 0% and 100% are both reachable. The resolution is one count: with ARR = 999, duty
        moves in steps of 0.1%.</p>
      ${eq(String.raw`D = \frac{\mathrm{CCR}}{\mathrm{ARR} + 1} \;\text{(mode 1)} \qquad D = 1 - \frac{\mathrm{CCR}}{\mathrm{ARR} + 1} \;\text{(mode 2)}`)}
      <h2>Frequency and resolution trade off</h2>
      <p>The PWM frequency is the timer's update rate, the clock divided by (PSC + 1) × (ARR + 1). A larger ARR gives
        finer duty steps but a lower frequency from the same clock. From 16 MHz with no prescaler, ARR = 999 gives 16 kHz
        with 1000 steps, above hearing, which matters for motors, and far faster than an eye can see flicker, which matters
        for LEDs. Writing a new CCR takes effect at the next update when preload is on (OCxPE), so a period is never cut
        short.</p>
      ${eq(String.raw`f_{\mathrm{PWM}} = \frac{f_{\mathrm{clk}}}{(\mathrm{PSC} + 1)(\mathrm{ARR} + 1)} = \frac{16\,\mathrm{MHz}}{1 \times 1000} = 16\,\mathrm{kHz}`)}
      <h2>Why the LED looks dimmer</h2>
      <p>The LED is either fully on or fully off; it never sees a lower voltage. It is the eye, or a motor's inertia, or an
        RC filter on the pin, that averages the pulses into duty × 3.3 V. With a filter, PWM becomes a crude
        digital-to-analog converter. The same channel hardware also drives the <a href="?p=ws2812" data-nav>WS2812</a>
        LED protocol when its pulses are fed by DMA.</p>
      ${eq(String.raw`V_{\mathrm{avg}} = D \cdot V_{\mathrm{DD}} = 0.2 \times 3.3\,\mathrm{V} = 0.66\,\mathrm{V}`)}
    </section>`;

  function draw() {
    const r = timer(0, ARR, (ARR + 1) * PERIODS);
    const lanes = timerLanes(r, ARR, [{ v: Math.min(ccr, ARR + 0.001), label: `CCR ${ccr}`, color: 'var(--ch1)' }]).slice(2);
    const out = r.cnt.map((c, k): [number, number] => [k, oc(mode, c, ccr)]);
    lanes.push({ name: 'OC1', sub: `PWM mode ${mode}`, color: 'var(--ch3)', digital: true, h: 44, pts: out });
    const d = duty(mode, ccr, ARR);
    root.querySelector('.pf-wave')!.innerHTML = waveHtml({ lanes, end: (ARR + 1) * PERIODS, every: ARR + 1, unit: 'ticks' });
    const pct = `${Math.round(d * 100)}%`;
    root.querySelector('.pf-readout')!.innerHTML = `<span>Frequency <b>${hz(CLK / (ARR + 1))}</b></span><span>Duty <b>${pct}</b></span><span>Average <b>${(d * VDD).toFixed(2)} V</b></span><span class="pf-lamp">LED <i class="pf-led" style="--glow:${d}" role="img" aria-label="${pct} brightness"></i></span>`;
    markSeg(root, 'ccr', String(ccr));
    markSeg(root, 'mode', String(mode));
    status(root, explain(ccr, mode, d));
    syncUrl({ ccr: String(ccr), mode: String(mode) });
  }

  draw();
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.pf-bar [role=radio]');
    if (!b) return;
    if (b.dataset.ccr) ccr = Number(b.dataset.ccr);
    else if (b.dataset.mode) mode = b.dataset.mode === '2' ? 2 : 1;
    draw();
  });
}

function explain(ccr: number, mode: PwmMode, d: number) {
  const pct = `${Math.round(d * 100)}%`;
  if (ccr === 0) return mode === 1
    ? 'CCR is 0, and CNT is never below 0, so the output never goes high: 0% duty. The LED is off.'
    : 'CCR is 0, so in mode 2 the output is high for the whole period: 100% duty.';
  if (ccr > ARR) return mode === 1
    ? `CCR is ${ccr}, above ARR = ${ARR}, so CNT is always below it and the output never goes low: 100% duty, ${(d * VDD).toFixed(2)} V on average.`
    : `CCR is ${ccr}, above ARR, so in mode 2 the output never goes high: 0% duty.`;
  return mode === 1
    ? `The output is high while CNT is 0 to ${ccr - 1}, then low from the match at ${ccr} until the counter wraps: ${ccr} of ${ARR + 1} counts, ${pct} duty, ${(d * VDD).toFixed(2)} V on average.`
    : `Mode 2 inverts mode 1: low while CNT is below ${ccr}, high from ${ccr} to ${ARR}: ${ARR + 1 - ccr} of ${ARR + 1} counts, ${pct} duty.`;
}
