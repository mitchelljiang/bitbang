/**
 * The clock tree page: the RP2040's PLL, from the crystal through the dividers to the system clock. `pll` holds the
 * datasheet's rules; verify checks it against the datasheet's own worked examples and limits.
 */
import { markSeg, reservedStatus, seg, syncUrl } from './dbg';

export const XOSC_MHZ = 12;
export interface PllSet { refdiv: number; fbdiv: number; pd1: number; pd2: number }

/** RP2040 datasheet 2.18.2: the frequencies a PLL setting gives, and every limit it breaks. `max` is that output's limit. */
export function pll(s: PllSet, xosc = XOSC_MHZ, max = 133) {
  const ref = xosc / s.refdiv, vco = ref * s.fbdiv, out = vco / (s.pd1 * s.pd2);
  const errors: string[] = [];
  if (ref < 5) errors.push(`The reference is ${ref} MHz; the PLL needs at least 5 MHz.`);
  if (s.fbdiv < 16 || s.fbdiv > 320) errors.push('The feedback divider must be from 16 to 320.');
  if (vco < 750) errors.push(`The VCO is at ${vco} MHz; it needs at least 750 MHz.`);
  if (vco > 1600) errors.push(`The VCO is at ${vco} MHz; it cannot exceed 1600 MHz.`);
  if (ref > vco / 16) errors.push('The reference is above the VCO frequency divided by 16.');
  if (s.pd1 < 1 || s.pd1 > 7 || s.pd2 < 1 || s.pd2 > 7) errors.push('The post dividers must be from 1 to 7.');
  if (out > max) errors.push(`The output is ${out} MHz, above this clock’s ${max} MHz limit.`);
  return { ref, vco, out, errors };
}

const PRESETS: Record<string, { label: string; set: PllSet; say: string }> = {
  sys: { label: '125 MHz', set: { refdiv: 1, fbdiv: 125, pd1: 6, pd2: 2 }, say: 'The VCO runs at 1500 MHz and is divided by 12. A high VCO gives the least jitter, and costs the most power.' },
  low: { label: '126, low power', set: { refdiv: 1, fbdiv: 63, pd1: 6, pd2: 1 }, say: 'A 756 MHz VCO, the lowest a 12 MHz crystal allows, gives 126 MHz. A slower VCO uses less power, at the price of more jitter.' },
  usb: { label: 'USB 48 MHz', set: { refdiv: 1, fbdiv: 100, pd1: 5, pd2: 5 }, say: 'USB needs exactly 48 MHz: 1200 MHz divided by 25.' },
  hi: { label: 'Too fast', set: { refdiv: 1, fbdiv: 133, pd1: 3, pd2: 1 }, say: 'The VCO is legal, but the system clock would be 532 MHz.' },
};
const KEYS = Object.keys(PRESETS);
const STEP: Record<keyof PllSet, [string, number, number]> = { refdiv: ['REFDIV', 1, 3], fbdiv: ['FBDIV', 1, 140], pd1: ['POSTDIV1', 1, 7], pd2: ['POSTDIV2', 1, 7] };
const f = (v: number) => `${Number(v.toFixed(2))} MHz`;

export function mountClockTree(root: HTMLElement) {
  let key = 'sys';
  const set: PllSet = { ...PRESETS.sys.set };
  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Clocks</p>
      <h1>Clock tree</h1>
      <p>A crystal is stable but slow; a processor wants to be fast. A phase-locked loop bridges the two: it multiplies
        the crystal’s frequency, and dividers then bring it down to what each part of the chip needs. These are the real
        limits of the RP2040’s PLL. Change the dividers and watch which stage goes out of range.</p>
    </section>
    <section class="debugger clk" aria-label="Clock tree">
      <header class="dbg-bar"><span class="dbg-file">pll_sys</span><div class="dbg-controls">${seg('p', 'Preset', KEYS.map((k) => [k, PRESETS[k].label]))}</div></header>
      <div class="clk-flow"></div>
      <div class="clk-ctl">${(Object.keys(STEP) as (keyof PllSet)[]).map((k) => `<span class="clk-st"><small>${STEP[k][0]}</small><button type="button" class="dbg-btn" data-k="${k}" data-d="-1" aria-label="Lower ${STEP[k][0]}">−</button><output data-v="${k}"></output><button type="button" class="dbg-btn" data-k="${k}" data-d="1" aria-label="Raise ${STEP[k][0]}">+</button></span>`).join('')}</div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>How a PLL multiplies</h2>
      <p>Inside is a voltage-controlled oscillator, the VCO, running very fast. A divider feeds a slowed copy of it back to
        be compared with the reference. If the copy runs slow, the VCO is pushed faster, and so it settles at exactly
        reference × FBDIV. The output is then divided down: (12 MHz ÷ REFDIV) × FBDIV ÷ (POSTDIV1 × POSTDIV2).</p>
      <h2>Why the same output has several settings</h2>
      <p>Many settings reach the same frequency. Running the VCO high minimizes jitter, the cycle-to-cycle variation of the
        clock; running it low saves power. With a 12 MHz crystal, the VCO’s 750 to 1600 MHz range means FBDIV must be
        between 63 and 133.</p>
      <h2>Branches of the tree</h2>
      <p>The RP2040 has two PLLs: <code>pll_sys</code> for the processors, up to 133 MHz, and <code>pll_usb</code> for a
        48 MHz USB clock. From there, clock generators with their own dividers and glitchless switches feed the peripherals.
        It boots from an internal ring oscillator and only moves onto a PLL when software has set one up, so a bad setting cannot
        stop it from starting. Everything that counts time, from a <a href="?p=timers" data-nav>timer</a> to a UART’s baud rate,
        is derived from these clocks.</p>
    </section>`;
  const panel = root.querySelector<HTMLElement>('.clk')!;
  const say = reservedStatus(panel, [...KEYS.map((k) => `${PRESETS[k].say} ${pll(PRESETS[k].set).errors.join(' ')}`), 'The reference is 4 MHz; the PLL needs at least 5 MHz. The VCO is at 560 MHz; it needs at least 750 MHz. The output is 560 MHz, above this clock’s 133 MHz limit.']);
  function draw() {
    const p = pll(set);
    const bad = (t: string) => p.errors.some((e) => e.includes(t));
    const box = (name: string, v: string, b = false) => `<div class="clk-b${b ? ' bad' : ''}"><small>${name}</small><b>${v}</b></div>`;
    const arrow = (t: string) => `<i class="clk-a">${t}</i>`;
    root.querySelector('.clk-flow')!.innerHTML = box('Crystal', f(XOSC_MHZ)) + arrow(`÷${set.refdiv}`) + box('Reference', f(p.ref), bad('reference')) + arrow(`×${set.fbdiv}`) + box('VCO', f(p.vco), bad('VCO')) + arrow(`÷${set.pd1 * set.pd2}`) + box('Output', f(p.out), bad('output'));
    (Object.keys(STEP) as (keyof PllSet)[]).forEach((k) => {
      root.querySelector(`[data-v="${k}"]`)!.textContent = String(set[k]);
      root.querySelector<HTMLButtonElement>(`[data-k="${k}"][data-d="-1"]`)!.disabled = set[k] <= STEP[k][1];
      root.querySelector<HTMLButtonElement>(`[data-k="${k}"][data-d="1"]`)!.disabled = set[k] >= STEP[k][2];
    });
    panel.classList.toggle('over', p.errors.length > 0);
    say(p.errors.length ? p.errors.join(' ') : key ? PRESETS[key].say : `Legal: ${f(p.vco)} VCO, ${f(p.out)} output.`);
    markSeg(root, 'p', key);
    syncUrl({ p: key });
  }
  panel.addEventListener('click', (e) => {
    const t = e.target as Element, b = t.closest<HTMLElement>('[data-p]'), c = t.closest<HTMLElement>('[data-k]');
    if (b) { key = b.dataset.p!; Object.assign(set, PRESETS[key].set); }
    else if (c) { const k = c.dataset.k as keyof PllSet; set[k] += Number(c.dataset.d); key = ''; }
    else return;
    draw();
  });
  draw();
}
