/**
 * The battery life page: a device that wakes, works and sleeps, drawn as current against time, and what that means for
 * a battery. The formula is exported; verify checks it against a brute-force sum over a period.
 */
import { markSeg, oneOf, reservedStatus, seg, syncUrl } from './dbg';

/** Average current in mA for `activeMs` at `activeMa` and the rest of `periodMs` at `sleepMa`. */
export const averageMa = (activeMa: number, activeMs: number, sleepMa: number, periodMs: number) =>
  (activeMa * activeMs + sleepMa * (periodMs - activeMs)) / periodMs;
/** Hours a battery of `mah` lasts at `avgMa`, taking `usable` of its rating. */
export const lifeHours = (mah: number, avgMa: number, usable = 0.8) => (mah * usable) / avgMa;
export const describeLife = (h: number) => h < 48 ? `${h.toFixed(1)} hours` : h < 24 * 60 ? `${(h / 24).toFixed(1)} days` : h < 24 * 730 ? `${(h / 24 / 30.4).toFixed(1)} months` : `${(h / 24 / 365).toFixed(1)} years`;

const SLEEP = { none: { label: 'No sleep', ma: 9.4 }, sleep: { label: 'Sleep', ma: 0.39 }, dormant: { label: 'Dormant', ma: 0.18 } } as const;
const PERIODS = { p1: { label: 'Every 100 ms', ms: 100 }, p2: { label: 'Every 1 s', ms: 1000 }, p3: { label: 'Every 10 s', ms: 10000 } } as const;
const ACTIVE = { a1: { label: '2 ms', ms: 2 }, a2: { label: '10 ms', ms: 10 }, a3: { label: '50 ms', ms: 50 } } as const;
const CELLS = { c1: { label: 'CR2032 · 220 mAh', mah: 220 }, c2: { label: 'AA · 2500 mAh', mah: 2500 } } as const;
type K<T> = keyof T & string;

export function mountBatteryLife(root: HTMLElement) {
  let sleep: K<typeof SLEEP> = oneOf('s', Object.keys(SLEEP) as K<typeof SLEEP>[], 'sleep');
  let period: K<typeof PERIODS> = oneOf('t', Object.keys(PERIODS) as K<typeof PERIODS>[], 'p2');
  let active: K<typeof ACTIVE> = oneOf('a', Object.keys(ACTIVE) as K<typeof ACTIVE>[], 'a2');
  let cell: K<typeof CELLS> = oneOf('c', Object.keys(CELLS) as K<typeof CELLS>[], 'c1');
  const ACTIVE_MA = 9.4;
  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Energy</p>
      <h1>Battery life</h1>
      <p>A device that lasts for years is asleep almost all the time. Its life depends on the average current, and that
        comes from a simple sum: how long it is awake, how much it draws then, and what it draws the rest of the
        time. Change the schedule and see which number matters.</p>
    </section>
    <section class="debugger bat" aria-label="Battery life">
      <header class="dbg-bar"><span class="dbg-file">Current over one period</span><div class="dbg-controls">${seg('c', 'Battery', Object.entries(CELLS).map(([k, v]) => [k, v.label]))}</div></header>
      <div class="pp-tabs bat-tabs">
        <span class="bat-c"><small>Between tasks</small>${seg('s', 'Between tasks', Object.entries(SLEEP).map(([k, v]) => [k, v.label]))}</span>
        <span class="bat-c"><small>Wakes</small>${seg('t', 'Period', Object.entries(PERIODS).map(([k, v]) => [k, v.label]))}</span>
        <span class="bat-c"><small>Awake for</small>${seg('a', 'Active time', Object.entries(ACTIVE).map(([k, v]) => [k, v.label]))}</span>
      </div>
      <div class="bat-plot"></div>
      <div class="pp-read bat-read"></div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>The sum</h2>
      <p>Average current is each current weighted by the share of time spent at it:
        (I<sub>active</sub> × t<sub>active</sub> + I<sub>sleep</sub> × t<sub>sleep</sub>) ÷ period. Battery life is then capacity
        divided by that average. The page uses 80% of the rated capacity, because a cell cannot deliver all of it, particularly a coin cell
        under load.</p>
      <h2>When sleep stops mattering</h2>
      <p>Two terms compete. If the device wakes often, the active term is larger and the answer is to work faster or wake less. If it
        wakes rarely, the sleep term wins and every microamp counts. The point where they are equal tells you which one to work on.</p>
      <h2>What this leaves out</h2>
      <p>These are the RP2040’s core-supply figures from its datasheet, so a real product will do worse. Add the regulator’s own
        quiescent current, flash, sensors, a radio and pull-ups. Waking also costs energy: restarting oscillators and the
        <a href="?p=clock-tree" data-nav>PLL</a> takes time at full current. A coin cell cannot supply large pulses, so bursts often need a capacitor. Measure
        with a real board before promising a number.</p>
    </section>`;
  const panel = root.querySelector<HTMLElement>('.bat')!;
  const verdict = (a: number, s: number) => a > s * 3 ? 'Awake time is most of the budget: work less or wake less often.' : s > a * 3 ? 'Sleep current is most of the budget: every microamp between tasks counts.' : 'The awake and asleep terms are about equal.';
  const say = reservedStatus(panel, [verdict(10, 1), verdict(1, 10), verdict(1, 1), 'Awake time is most of the budget: work less or wake less often. 1234 µA-average parts.']);
  function draw() {
    const s = SLEEP[sleep].ma, T = PERIODS[period].ms, a = ACTIVE[active].ms, cap = CELLS[cell].mah;
    const avg = averageMa(ACTIVE_MA, a, s, T);
    const aTerm = (ACTIVE_MA * a) / T, sTerm = (s * (T - a)) / T;
    const pct = Math.max(1.2, (a / T) * 100);
    const h = (ma: number) => Math.max(2, (Math.log10(ma / 0.1) / Math.log10(20 / 0.1)) * 100);
    root.querySelector('.bat-plot')!.innerHTML = `<div class="bat-a" style="width:${pct}%;height:${h(ACTIVE_MA)}%"></div><div class="bat-s" style="left:${pct}%;height:${h(s)}%"></div><div class="bat-avg" style="bottom:${h(avg)}%"><span>average ${avg < 1 ? `${(avg * 1000).toFixed(0)} µA` : `${avg.toFixed(2)} mA`}</span></div>`;
    root.querySelector('.bat-read')!.innerHTML = `<span>Battery life <b>${describeLife(lifeHours(cap, avg))}</b></span><span>Awake <b>${(aTerm * 1000).toFixed(0)} µA</b></span><span>Asleep <b>${(sTerm * 1000).toFixed(0)} µA</b></span><span class="dim">${((a / T) * 100).toFixed(2)}% awake</span>`;
    say(verdict(aTerm, sTerm));
    markSeg(root, 's', sleep); markSeg(root, 't', period); markSeg(root, 'a', active); markSeg(root, 'c', cell);
    syncUrl({ s: sleep, t: period, a: active, c: cell });
  }
  panel.addEventListener('click', (e) => {
    const t = e.target as Element;
    const pick = (k: string) => t.closest<HTMLElement>(`[data-${k}]`)?.dataset[k];
    const a1 = pick('s'), a2 = pick('t'), a3 = pick('a'), a4 = pick('c');
    if (a1) sleep = a1 as typeof sleep; else if (a2) period = a2 as typeof period; else if (a3) active = a3 as typeof active; else if (a4) cell = a4 as typeof cell; else return;
    draw();
  });
  draw();
}
