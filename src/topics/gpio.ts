/**
 * GPIO: one pin, PA5, drawn as the circuit inside the chip. The output driver is two switches, P to 3.3 V and N to
 * ground; push-pull uses both, open-drain only N. Optional pull-up and pull-down resistors and an external button to
 * ground complete it. Set the registers and press the button, and the page lights the path current takes and says what
 * the pin is and what IDR reads.
 *
 * Two independent answers are exported for the checks: `level` applies the rules a datasheet states, and `solve` works
 * the circuit out from resistances. They must agree in every one of the 48 settings.
 */
import { markSeg, seg, status, syncUrl } from './dbg';
import { eq } from './math';

export type Mode = 'in' | 'out';
export type OType = 'pp' | 'od';
export type Pull = 'none' | 'up' | 'down';
export interface Pin { mode: Mode; otype: OType; pull: Pull; odr: 0 | 1; btn: boolean }
export type Level = 'high' | 'low' | 'float' | 'short';

export const VDD = 3.3;
/** Typical STM32F4 values: an output switch is tens of ohms, a weak pull about 40 kΩ, a closed button a fraction of an ohm. */
export const R_DRIVE = 50, R_PULL = 40_000, R_BUTTON = 0.1;
/** Absolute maximum current through one STM32F4 pin. */
export const I_MAX = 0.025;

/** Which parts conduct. P only drives in push-pull output; N whenever an output writes 0. */
export function parts(s: Pin) {
  const out = s.mode === 'out';
  return { p: out && s.otype === 'pp' && s.odr === 1, n: out && s.odr === 0, pu: s.pull === 'up', pd: s.pull === 'down', btn: s.btn };
}

/** The pin's state by the rules: a strong driver beats a weak pull, two strong drivers fighting is a short, nothing is floating. */
export function level(s: Pin): Level {
  const c = parts(s);
  const hi = c.p, lo = c.n || c.btn;
  if (hi && lo) return 'short';
  if (hi) return 'high';
  if (lo) return 'low';
  return c.pu ? 'high' : c.pd ? 'low' : 'float';
}

/** The same pin solved as a circuit: the node voltage from the conductances to 3.3 V and to ground, and the current from 3.3 V. */
export function solve(s: Pin): { v: number | null; amps: number } {
  const c = parts(s);
  const up = (c.p ? 1 / R_DRIVE : 0) + (c.pu ? 1 / R_PULL : 0);
  const down = (c.n ? 1 / R_DRIVE : 0) + (c.pd ? 1 / R_PULL : 0) + (c.btn ? 1 / R_BUTTON : 0);
  if (!up && !down) return { v: null, amps: 0 };
  const v = (up * VDD) / (up + down);
  return { v, amps: (VDD - v) * up };
}

/** What the input buffer reads: 1 above 0.7 × VDD, 0 below 0.3 × VDD, and nothing certain in between or when floating. */
export const idrOf = (v: number | null): 0 | 1 | null => (v === null ? null : v >= 0.7 * VDD ? 1 : v <= 0.3 * VDD ? 0 : null);

const amps = (a: number) => (a >= 1e-3 ? `${(a * 1e3).toFixed(0)} mA` : a >= 1e-6 ? `${(a * 1e6).toFixed(0)} µA` : '0');

/** A switch between (x, y1) and (x, y2), closed or open, with its terminals. */
const sw = (x: number, y1: number, y2: number, closed: boolean, cls: string) => `
  <line class="${cls}" x1="${x}" y1="${y1}" x2="${closed ? x : x + 16}" y2="${closed ? y2 : y2 - 8}"/><circle class="${cls}" cx="${x}" cy="${y1}" r="3.5"/><circle class="${cls}" cx="${x}" cy="${y2}" r="3.5"/>`;
/** A resistor zigzag between (x, y1) and (x, y2). */
const res = (x: number, y1: number, y2: number, cls: string) => {
  const n = 6, h = (y2 - y1) / n;
  const pts = Array.from({ length: n + 1 }, (_, i) => `${i === 0 || i === n ? x : x + (i % 2 ? 9 : -9)},${y1 + i * h}`).join(' ');
  return `<polyline class="${cls}" points="${pts}"/>`;
};

function schematic(s: Pin) {
  const c = parts(s), lv = level(s), { amps: a } = solve(s);
  const flow = a > 0;
  const hot = lv === 'short' ? 'w bad' : 'w hot';
  // A branch carries current when it conducts and there is a path through it from 3.3 V to ground.
  const k = (on: boolean) => (flow && on ? hot : on ? 'w on' : 'w');
  const od = s.otype === 'od' && s.mode === 'out';
  const p = `${k(c.p)}${od ? ' gone' : ''}`, pu = `${k(c.pu)}${c.pu ? '' : ' gone'}`, pd = `${k(c.pd)}${c.pd ? '' : ' gone'}`;
  const node = lv === 'float' ? 'w float' : flow ? hot : 'w on';
  const rail = flow ? hot : 'w on';
  return `
  <svg class="gp-svg" viewBox="0 0 456 304" role="img" aria-label="PA5 circuit: the pin is ${lv === 'short' ? 'shorted' : lv}">
    <text class="t rail" x="40" y="15">3.3 V</text>
    <line class="${rail}" x1="40" y1="24" x2="210" y2="24"/>
    <text class="t rail" x="40" y="298">GND</text>
    <line class="${rail}" x1="40" y1="276" x2="370" y2="276"/>

    <rect class="box" x="78" y="52" width="64" height="196" rx="8"/>
    <text class="t dim" x="118" y="46">driver</text>
    <line class="${p}" x1="110" y1="24" x2="110" y2="72"/>${sw(110, 72, 112, c.p, p)}
    <line class="${p}" x1="110" y1="112" x2="110" y2="150"/>
    <text class="t${c.p ? ' lit' : ''}${od ? ' gone' : ''}" x="128" y="96">P</text>
    <line class="${k(c.n)}" x1="110" y1="150" x2="110" y2="188"/>${sw(110, 188, 228, c.n, k(c.n))}
    <line class="${k(c.n)}" x1="110" y1="228" x2="110" y2="276"/>
    <text class="t${c.n ? ' lit' : ''}" x="128" y="212">N</text>

    <line class="${pu}" x1="200" y1="24" x2="200" y2="62"/>${res(200, 62, 112, pu)}
    <line class="${pu}" x1="200" y1="112" x2="200" y2="150"/>
    <text class="t${c.pu ? '' : ' gone'}" x="214" y="84">pull-up</text><text class="t dim${c.pu ? '' : ' gone'}" x="214" y="102">40 kΩ</text>
    <line class="${pd}" x1="200" y1="150" x2="200" y2="188"/>${res(200, 188, 238, pd)}
    <line class="${pd}" x1="200" y1="238" x2="200" y2="276"/>
    <text class="t${c.pd ? '' : ' gone'}" x="214" y="210">pull-down</text><text class="t dim${c.pd ? '' : ' gone'}" x="214" y="228">40 kΩ</text>

    <line class="${node}" x1="38" y1="150" x2="300" y2="150"/>
    <polygon class="buf" points="38,138 38,162 14,150"/>
    <text class="t" x="26" y="128" text-anchor="middle">IDR</text>
    <text class="t big" x="26" y="190" text-anchor="middle">${idrOf(solve(s).v) ?? '?'}</text>

    <rect class="pad ${lv}" x="300" y="138" width="24" height="24" rx="3"/>
    <text class="t" x="312" y="128" text-anchor="middle">PA5</text>
    <line class="${k(c.btn)}" x1="324" y1="150" x2="370" y2="150"/>
    <line class="${k(c.btn)}" x1="370" y1="150" x2="370" y2="190"/>${sw(370, 190, 232, c.btn, k(c.btn))}
    <line class="${k(c.btn)}" x1="370" y1="232" x2="370" y2="276"/>
    <text class="t" x="386" y="214">button</text>
  </svg>`;
}

const LEVEL_TEXT: Record<Level, string> = { high: 'High', low: 'Low', float: 'Floating', short: 'Short' };

export function mountGpio(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  const s: Pin = {
    mode: q.get('mode') === 'in' ? 'in' : 'out',
    otype: q.get('type') === 'od' ? 'od' : 'pp',
    pull: (['none', 'up', 'down'] as const).find((p) => p === q.get('pull')) ?? 'none',
    odr: q.get('odr') === '0' ? 0 : 1,
    btn: q.get('btn') === '1',
  };

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Pins</p>
      <h1>GPIO</h1>
      <p>A general-purpose I/O pin is a few switches and resistors behind one pad. As an output it connects the pad to
        3.3 V or to ground; as an input it lets something else set the voltage and reads it. Below is pin PA5 as the
        circuit inside the chip, with a button outside it. Set the registers, press the button, and follow where the
        current goes. The registers themselves are covered in <a href="?p=mmio" data-nav>Memory-mapped I/O</a>.</p>
    </section>
    <section class="debugger mem periph gpio" aria-label="GPIO pin circuit">
      <header class="dbg-bar gp-bar">
        <span class="dbg-file">STM32F4 · PA5</span>
        <div class="gp-ctls">
          <div class="gp-ctl"><span>Mode</span>${seg('mode', 'Pin mode', [['in', 'Input'], ['out', 'Output']])}</div>
          <div class="gp-ctl"><span>Type</span>${seg('type', 'Output type', [['pp', 'Push-pull'], ['od', 'Open-drain']])}</div>
          <div class="gp-ctl"><span>Pull</span>${seg('pull', 'Pull resistor', [['none', 'None'], ['up', 'Up'], ['down', 'Down']])}</div>
          <div class="gp-ctl"><span>ODR</span>${seg('odr', 'Output data bit', [['0', '0'], ['1', '1']])}</div>
          <div class="gp-ctl"><span>Button</span>${seg('btn', 'Button', [['0', 'Up'], ['1', 'Pressed']])}</div>
        </div>
      </header>
      <div class="gp-body">
        <div class="gp-circuit"></div>
        <dl class="gp-read"></dl>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Push-pull and open-drain</h2>
      <p>A push-pull output has two switches, transistors in silicon: P connects the pin to 3.3 V and N connects it to
        ground, and exactly one is on, so the pin is always driven. An open-drain output has only N. Writing 0 pulls the
        pin low; writing 1 lets go, and something else must pull it high: a resistor, inside or outside the chip. That
        sounds like a weakness, but it lets several devices share one wire safely. Any of them can pull it low, and none
        can fight another by driving high, which is why <a href="?p=i2c" data-nav>I²C</a> and
        <a href="?p=onewire" data-nav>1-Wire</a> use it.</p>
      <h2>Pull-ups and floating inputs</h2>
      <p>An input with nothing connected is floating: its voltage drifts with leakage and nearby signals, and IDR can read
        0 or 1 at random. A pull resistor gives it a default. The internal pulls are weak, about 40 kΩ, so anything
        stronger, such as a button to ground, wins easily: with a pull-up and the button pressed, about 82 µA flows and
        the pin reads 0. Released, the pull-up brings it back to 1. That is why a button wired to ground reads 0 when
        pressed, and why a long or noisy wire may want a stronger external resistor.</p>
      ${eq(String.raw`I = \frac{V_{\mathrm{DD}}}{R_{\mathrm{pull}}} = \frac{3.3\,\mathrm{V}}{40\,\mathrm{k}\Omega} \approx 82\,\mu\mathrm{A}`)}
      <h2>The short to avoid</h2>
      <p>Drive a push-pull pin high while the button connects it to ground, and the only thing limiting the current is the
        few tens of ohms of the switches: tens of milliamps, beyond the 25 mA a pin on this chip can safely carry. The fix is
        to read buttons on inputs, to use open-drain when a wire can be driven from both ends, or to add a series
        resistor. A button also bounces when pressed, so a pin may read several presses for one; that is debouncing.</p>
      ${eq(String.raw`I \approx \frac{V_{\mathrm{DD}}}{R_{\mathrm{P}}} = \frac{3.3\,\mathrm{V}}{50\,\Omega} \approx 66\,\mathrm{mA} \gg 25\,\mathrm{mA}`)}
    </section>`;

  function draw() {
    const lv = level(s), { v, amps: a } = solve(s), idr = idrOf(v);
    root.querySelector('.gp-circuit')!.innerHTML = schematic(s);
    root.querySelector('.gp-read')!.innerHTML = `
      <div class="lv ${lv}"><dt>Pin</dt><dd>${LEVEL_TEXT[lv]}</dd></div>
      <div><dt>Voltage</dt><dd>${v === null ? '—' : `${v.toFixed(2)} V`}</dd></div>
      <div><dt>Current</dt><dd${a > I_MAX ? ' class="bad"' : ''}>${amps(a)}</dd></div>
      <div><dt>IDR</dt><dd>${idr ?? '?'}</dd></div>
      <div class="regs"><dt>Registers</dt><dd><span>MODER <b>${s.mode === 'out' ? '01' : '00'}</b></span><span>OTYPER <b>${s.otype === 'od' ? 1 : 0}</b></span><span>PUPDR <b>${s.pull === 'up' ? '01' : s.pull === 'down' ? '10' : '00'}</b></span><span>ODR <b>${s.odr}</b></span></dd></div>`;
    markSeg(root, 'mode', s.mode);
    markSeg(root, 'type', s.otype);
    markSeg(root, 'pull', s.pull);
    markSeg(root, 'odr', String(s.odr));
    markSeg(root, 'btn', s.btn ? '1' : '0');
    status(root, explain(s, lv, a));
    syncUrl({ mode: s.mode, type: s.otype, pull: s.pull, odr: String(s.odr), btn: s.btn ? '1' : '0' });
  }

  draw();
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.gp-bar [role=radio]');
    if (!b) return;
    const d = b.dataset;
    if (d.mode) s.mode = d.mode as Mode;
    else if (d.type) s.otype = d.type as OType;
    else if (d.pull) s.pull = d.pull as Pull;
    else if (d.odr) s.odr = d.odr === '1' ? 1 : 0;
    else if (d.btn) s.btn = d.btn === '1';
    draw();
  });
}

function explain(s: Pin, lv: Level, a: number) {
  const pull = s.pull === 'up' ? 'the pull-up' : 'the pull-down';
  if (lv === 'short') return `<b>Short.</b> P drives the pin to 3.3 V while the button connects it to ground, so about ${amps(a)} flows straight through the pin, more than its 25 mA limit. Make the pin an input, or open-drain, before pressing.`;
  if (s.mode === 'out') {
    if (s.odr === 0) return `N connects the pin to ground, so it is <b>low</b>${s.btn ? ' and the button, also to ground, changes nothing' : ''}${s.pull === 'up' ? `. About ${amps(a)} flows through the pull-up, wasted while the pin is low` : ''}. IDR reads the pin back as 0.`;
    if (s.otype === 'pp') return `P connects the pin to 3.3 V, so it is <b>high</b> and IDR reads 1. ${s.pull === 'down' ? `The pull-down wastes about ${amps(a)} against it. ` : ''}Pressing the button now would short the pin.`;
    if (s.btn) return `Open-drain writing 1 lets go of the pin, so the button pulls it <b>low</b> and IDR reads 0. ${s.pull === 'up' ? `About ${amps(a)} flows through the pull-up. ` : ''}Nothing is damaged: no switch fights the button.`;
    if (s.pull === 'none') return 'Open-drain writing 1 lets go of the pin, and nothing else drives it: it is <b>floating</b>. An open-drain pin needs a pull-up, here or on the board, to read high.';
    return `Open-drain writing 1 lets go of the pin, so ${pull} sets it: <b>${lv}</b>, and IDR reads ${lv === 'high' ? 1 : 0}.`;
  }
  if (s.btn) return `The pin is an input, so the chip does not drive it. The button connects it to ground: <b>low</b>, IDR reads 0${s.pull === 'up' ? `, and about ${amps(a)} flows through the pull-up` : ''}.`;
  if (s.pull === 'none') return 'The pin is an input with nothing driving it and no pull resistor: it is <b>floating</b>, and IDR can read 0 or 1 at random. Turn on a pull resistor.';
  return `The pin is an input and the button is up, so ${pull} sets it: <b>${lv}</b>, and IDR reads ${lv === 'high' ? 1 : 0}.`;
}
