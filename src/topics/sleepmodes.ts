/**
 * The sleep modes page: which parts of an RP2040 run in each state, what wakes it, and the DVDD current the datasheet
 * measured (Table 637). Verify checks the numbers and that only the documented sources wake each state.
 */
import { markSeg, oneOf, reservedStatus, seg, syncUrl } from './dbg';

export const MODES = ['run', 'sleep', 'dormant'] as const;
export type Mode = (typeof MODES)[number];
/** Typical and maximum DVDD current in mA, RP2040 datasheet Table 637. Run is BOOTSEL mode, active. */
export const CURRENT: Record<Mode, { typ: number; max: number }> = { run: { typ: 9.4, max: 14.7 }, sleep: { typ: 0.39, max: 4.5 }, dormant: { typ: 0.18, max: 4.2 } };
export const WAKES: Record<Mode, string[]> = { run: [], sleep: ['interrupt'], dormant: ['gpio', 'rtc'] };
export const SOURCES = [['interrupt', 'Timer interrupt'], ['gpio', 'GPIO edge'], ['rtc', 'RTC alarm']] as const;

const BLOCKS: { name: string; on: Record<Mode, boolean>; say: string }[] = [
  { name: 'Processors', on: { run: true, sleep: false, dormant: false }, say: 'Stopped by a <code>wfi</code> or <code>wfe</code> instruction.' },
  { name: 'Bus fabric', on: { run: true, sleep: false, dormant: false }, say: 'Clock-gated in Sleep if its bit in SLEEP_EN is clear.' },
  { name: 'Peripherals', on: { run: true, sleep: true, dormant: false }, say: 'In Sleep, those left enabled in SLEEP_EN keep running, such as a UART that will wake the chip.' },
  { name: 'Oscillators', on: { run: true, sleep: true, dormant: false }, say: 'Sleep leaves them running. Dormant stops them, which is why nothing can count time inside the chip.' },
  { name: 'SRAM contents', on: { run: true, sleep: true, dormant: true }, say: 'System state is retained, so code resumes where it stopped.' },
];
const SAY: Record<Mode, string> = {
  run: 'Everything is clocked. The figure is the chip in its USB boot loader with the bus active, 9.4 mA on DVDD.',
  sleep: 'Both processors have stopped, so their clocks and, optionally, most others are gated off. An interrupt wakes the chip.',
  dormant: 'All clocks and oscillators are off, so there is no dynamic power at all. Only a GPIO event or the RTC can wake it.',
};

export function mountSleepModes(root: HTMLElement) {
  let mode = oneOf('m', MODES, 'run');
  let woke = '';
  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Energy</p>
      <h1>Sleep modes</h1>
      <p>Most of the current a chip draws goes on switching its clocks, so the way to save power is to stop them. The
        catch is that something has to start them again. Pick a state of the RP2040 to see what stops, and try what
        wakes it up.</p>
    </section>
    <section class="debugger slp" aria-label="Sleep modes">
      <header class="dbg-bar"><span class="dbg-file">RP2040</span><div class="dbg-controls">${seg('m', 'State', [['run', 'Run'], ['sleep', 'Sleep'], ['dormant', 'Dormant']])}</div></header>
      <div class="slp-body">
        <div class="slp-blocks"></div>
        <div class="slp-right">
          <div class="slp-cur"></div>
          <div class="slp-wake"><small>Try to wake it</small>${SOURCES.map(([k, l]) => `<button type="button" class="dbg-btn" data-w="${k}">${l}</button>`).join('')}</div>
        </div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Where the current goes</h2>
      <p>A CMOS gate draws almost nothing while it holds still and spends energy each time it switches: power is roughly
        proportional to capacitance, the voltage squared and the frequency. So stopping a clock removes nearly all of a
        block’s current, even with the power still on. What remains is leakage, which grows quickly with temperature. That is why
        the datasheet’s maximum for Dormant, measured on the worst silicon at the hot extreme, is 4.2 mA against a typical 0.18 mA.</p>
      <h2>Sleep and Dormant</h2>
      <p><strong>Sleep</strong> is entered when both processors are in <code>wfi</code> or <code>wfe</code> and DMA is idle.
        The oscillators keep running, so waking is immediate, and SLEEP_EN chooses which clocks stay on. <strong>Dormant</strong>
        stops every oscillator. It is entered by writing a keyword to the running oscillator’s DORMANT register. Waking requires a GPIO
        event, or the RTC running from an external clock, and then waiting for the oscillator to restart. PLLs are not stopped by
        Dormant, so software must power them down first and set them up again afterwards.</p>
      <h2>Reading the numbers</h2>
      <p>These are currents into the core supply only. A real board also has its regulator’s quiescent current, flash, sensors and
        pull-ups, which often dominate at this level. See <a href="?p=battery-life" data-nav>battery life</a> for what that does to a design.</p>
    </section>`;
  const panel = root.querySelector<HTMLElement>('.slp')!;
  const wakeSay = (m: Mode, k: string) => m === 'run' ? 'The chip is already awake.' : WAKES[m].includes(k) ? `Awake. ${k === 'interrupt' ? 'The interrupt restarts the processors straight away.' : 'An oscillator restarts, and once it is stable the program carries on from where it stopped.'}` : `Nothing happens: ${m === 'dormant' ? 'no clock is running to deliver an interrupt, so only a GPIO event or the RTC works.' : 'in Sleep, the program is waiting for an interrupt.'}`;
  const say = reservedStatus(panel, [...Object.values(SAY), ...MODES.flatMap((m) => SOURCES.map(([k]) => wakeSay(m, k))), ...BLOCKS.map((b) => b.say)]);
  function draw() {
    const log = (v: number) => (Math.log10(v / 0.1) / Math.log10(20 / 0.1)) * 100;
    root.querySelector('.slp-blocks')!.innerHTML = BLOCKS.map((b, i) => `<button type="button" class="slp-b${b.on[mode] ? ' on' : ''}" data-b="${i}"><i></i>${b.name}<small>${b.on[mode] ? (b.name === 'SRAM contents' ? 'kept' : 'running') : 'stopped'}</small></button>`).join('');
    root.querySelector('.slp-cur')!.innerHTML = MODES.map((m) => `<div class="slp-row${m === mode ? ' on' : ''}"><span>${m[0].toUpperCase()}${m.slice(1)}</span><div><i style="width:${log(CURRENT[m].typ)}%"></i></div><b>${CURRENT[m].typ} mA</b></div>`).join('') + '<small class="slp-note">Typical DVDD current, on a log scale</small>';
    say(woke ? wakeSay(mode, woke) : SAY[mode]);
    markSeg(root, 'm', mode);
    syncUrl({ m: mode });
  }
  panel.addEventListener('click', (e) => {
    const t = e.target as Element, m = t.closest<HTMLElement>('[data-m]'), w = t.closest<HTMLElement>('[data-w]'), b = t.closest<HTMLElement>('[data-b]');
    if (m) { mode = m.dataset.m as Mode; woke = ''; }
    else if (w) { woke = w.dataset.w!; draw(); if (WAKES[mode].includes(woke)) { say(wakeSay(mode, woke)); } return; }
    else if (b) { say(BLOCKS[Number(b.dataset.b)].say); return; }
    else return;
    draw();
  });
  draw();
}
