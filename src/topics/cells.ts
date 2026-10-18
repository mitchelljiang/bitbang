/**
 * Memory cells: how SRAM, DRAM and Flash each store one bit, and what that choice costs. Pick a type to see its cell
 * and a retention demo, cut power or let a DRAM capacitor leak, against a side-by-side comparison of all three.
 */
import { markSeg, oneOf, seg, status, syncUrl } from './dbg';

const TYPES = ['sram', 'dram', 'flash'] as const;
type Mem = (typeof TYPES)[number];
const NAME: Record<Mem, string> = { sram: 'SRAM', dram: 'DRAM', flash: 'Flash' };

/** The comparison rows, one value per type. */
const ROWS: [string, Record<Mem, string>][] = [
  ['Stores a bit as', { sram: 'a latch (feedback loop)', dram: 'charge on a capacitor', flash: 'charge on a floating gate' }],
  ['Devices per cell', { sram: '6 transistors', dram: '1 transistor + 1 capacitor', flash: '1 floating-gate transistor' }],
  ['Volatile?', { sram: 'yes — lost on power off', dram: 'yes — and leaks in ~ms', flash: 'no — holds for years' }],
  ['Refresh?', { sram: 'never', dram: 'every ~64 ms', flash: 'never' }],
  ['Access time', { sram: '~1 ns', dram: '~10–50 ns', flash: 'read ~ns, write ~µs–ms' }],
  ['Endurance', { sram: 'unlimited', dram: 'unlimited', flash: '~10⁴–10⁵ erases' }],
  ['Erase unit', { sram: 'per word', dram: 'per word', flash: 'a whole block' }],
  ['Used for', { sram: 'caches, MCU RAM', dram: 'main memory', flash: 'code, SSDs' }],
];

/** A small, illustrative cell diagram for each type (conceptual, not a full schematic). */
function cellSvg(type: Mem, present: boolean): string {
  const on = present ? '#5fd0a4' : '#3a434f';
  const txt = '#7d8995';
  if (type === 'sram') return `<svg viewBox="0 0 240 150" role="img" aria-label="SRAM latch cell">
    <line x1="40" y1="30" x2="200" y2="30" stroke="${txt}" stroke-width="1.5"/><text x="120" y="22" fill="${txt}" font-size="11" text-anchor="middle">word line</text>
    <rect x="70" y="55" width="45" height="40" rx="6" fill="none" stroke="${on}" stroke-width="2"/><text x="92" y="80" fill="${on}" font-size="11" text-anchor="middle">INV</text>
    <rect x="125" y="55" width="45" height="40" rx="6" fill="none" stroke="${on}" stroke-width="2"/><text x="147" y="80" fill="${on}" font-size="11" text-anchor="middle">INV</text>
    <path d="M115 65 H125" stroke="${on}" stroke-width="2"/><path d="M125 85 H115" stroke="${on}" stroke-width="2"/>
    <path d="M70 75 h-18 v-45" fill="none" stroke="${txt}" stroke-width="1.5"/><path d="M170 75 h18 v-45" fill="none" stroke="${txt}" stroke-width="1.5"/>
    <text x="120" y="120" fill="${txt}" font-size="11" text-anchor="middle">two cross-coupled inverters hold the bit</text></svg>`;
  if (type === 'dram') return `<svg viewBox="0 0 240 150" role="img" aria-label="DRAM capacitor cell">
    <line x1="40" y1="30" x2="200" y2="30" stroke="${txt}" stroke-width="1.5"/><text x="120" y="22" fill="${txt}" font-size="11" text-anchor="middle">word line</text>
    <rect x="80" y="48" width="34" height="30" rx="5" fill="none" stroke="${txt}" stroke-width="1.5"/><text x="97" y="67" fill="${txt}" font-size="10" text-anchor="middle">T</text>
    <path d="M97 48 V30" stroke="${txt}" stroke-width="1.5"/><path d="M114 63 H150" stroke="${on}" stroke-width="2"/>
    <line x1="150" y1="52" x2="150" y2="74" stroke="${on}" stroke-width="2.5"/><line x1="160" y1="52" x2="160" y2="74" stroke="${on}" stroke-width="2.5"/>
    <text x="155" y="92" fill="${on}" font-size="11" text-anchor="middle">C</text>
    <path d="M97 78 V110" stroke="${txt}" stroke-width="1.5"/><text x="120" y="128" fill="${txt}" font-size="11" text-anchor="middle">one capacitor holds the charge, and leaks</text></svg>`;
  return `<svg viewBox="0 0 240 150" role="img" aria-label="Flash floating-gate cell">
    <rect x="80" y="40" width="80" height="14" rx="3" fill="none" stroke="${txt}" stroke-width="1.5"/><text x="120" y="35" fill="${txt}" font-size="10" text-anchor="middle">control gate</text>
    <rect x="86" y="62" width="68" height="14" rx="3" fill="none" stroke="${on}" stroke-width="2"/><text x="120" y="90" fill="${on}" font-size="10" text-anchor="middle">floating gate (trapped charge)</text>
    <line x1="70" y1="104" x2="170" y2="104" stroke="${txt}" stroke-width="1.5"/><circle cx="82" cy="104" r="4" fill="none" stroke="${txt}"/><circle cx="158" cy="104" r="4" fill="none" stroke="${txt}"/>
    <text x="64" y="120" fill="${txt}" font-size="10" text-anchor="end">source</text><text x="176" y="120" fill="${txt}" font-size="10">drain</text>
    <text x="120" y="138" fill="${txt}" font-size="11" text-anchor="middle">charge sits on an isolated gate, no power needed</text></svg>`;
}

export function mountCells(root: HTMLElement) {
  let type = oneOf('m', TYPES, 'dram');
  let powered = true;
  let charge = 100; // DRAM capacitor charge, or Flash programmed state
  let erases = 0;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Memory hardware</p>
      <h1>SRAM, DRAM and Flash</h1>
      <p>Every memory stores a bit somehow, and the three in a typical system each make a different trade. SRAM holds a
        bit in a tiny latch: fast, but six transistors wide. DRAM uses one transistor and a capacitor: dense and cheap,
        but the charge leaks and must be topped up constantly. Flash traps charge on an insulated gate that survives
        power loss, but wears out and erases only in big blocks. Pick one and see how it holds, or loses, a bit.</p>
    </section>
    <section class="debugger mem cells" aria-label="Memory cells">
      <header class="dbg-bar">
        <span class="dbg-file">one bit cell</span>
        <span class="dbg-state"><i aria-hidden="true"></i>storage</span>
        <div class="dbg-controls">
          ${seg('m', 'Memory type', TYPES.map((t) => [t, NAME[t]]))}
          <span class="ce-actions"></span>
        </div>
      </header>
      <div class="ce-body">
        <div class="ce-left"><div class="ce-svg"></div><div class="ce-retain"></div></div>
        <table class="ce-cmp"></table>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Why a computer uses all three</h2>
      <p>No one cell wins on every axis, so a system layers them. SRAM is fastest and needs no refresh, but at six
        transistors a bit it is too big to build much of, so it is reserved for <a href="?p=caches" data-nav>caches</a>
        and a microcontroller’s on-chip RAM. DRAM packs far more bits per area, which is why gigabytes of main memory are
        DRAM, and the cost is a memory controller that quietly rewrites every row every few milliseconds. Flash keeps its
        contents with the power off, so it holds the program and the filesystem, at the price of slow, block-sized writes
        and a limited number of erases.</p>
      <h2>Why DRAM forgets</h2>
      <p>A DRAM bit is just charge on a capacitor so small it drains through leakage in milliseconds. The controller reads
        every row and writes it straight back, a <b>refresh</b>, often enough that no bit fades, typically all rows within
        64 ms. Refresh costs power and steals a little bandwidth, and it is why DRAM loses everything the instant the
        power, and the refresh, stop. SRAM does not leak because its latch actively drives the bit as long as it is
        powered, but it forgets just as completely when the power goes.</p>
      <h2>Why Flash wears out and erases in blocks</h2>
      <p>Writing Flash forces charge through an insulator onto the floating gate; erasing pulls it back off. Each pass
        damages the insulator a little, so a cell tolerates only tens of thousands of erase cycles before it can no longer
        hold a clean level. And erasing only works on a whole block at once: you can program individual bits from 1 to 0,
        but to set any bit back to 1 you must erase the entire block. That asymmetry is why SSDs and flash filesystems run
        <b>wear levelling</b>, spreading writes so no one block is erased to death while others sit idle.</p>
    </section>`;

  function present(): boolean {
    if (type === 'flash') return charge > 0; // non-volatile: power does not matter
    if (!powered) return false; // SRAM and DRAM are volatile
    return type === 'sram' ? true : charge > 40; // DRAM lost once the capacitor drains
  }

  function draw(note?: string) {
    const here = present();
    root.querySelector('.ce-svg')!.innerHTML = cellSvg(type, here);

    // Retention bar + contextual readout.
    const level = type === 'sram' ? (powered ? 100 : 0) : charge;
    const barCls = here ? 'ok' : 'lost';
    const label = type === 'flash'
      ? (here ? 'programmed · survives power off' : 'erased')
      : !powered ? 'power off · bit lost'
        : type === 'sram' ? 'powered · latch holds the bit'
          : here ? `capacitor ${Math.round(level)}% charged` : 'capacitor drained · bit lost';
    root.querySelector('.ce-retain')!.innerHTML =
      `<div class="ce-bar"><div class="ce-fill ${barCls}" style="width:${level}%"></div></div>` +
      `<p class="ce-label ${barCls}">${label}</p>` +
      (type === 'flash' ? `<p class="ce-wear">erase/program cycles: <b>${erases}</b>${erases > 20 ? ' · cell wearing out' : ''}</p>` : '');

    // Contextual action buttons.
    const acts = type === 'sram'
      ? [[powered ? 'cut' : 'on', powered ? 'Cut power' : 'Restore power']]
      : type === 'dram'
        ? [['wait', 'Wait 64 ms'], ['refresh', 'Refresh'], [powered ? 'cut' : 'on', powered ? 'Cut power' : 'Restore power']]
        : [[charge ? 'erase' : 'prog', charge ? 'Erase block' : 'Program'], ['cut', 'Cut power']];
    root.querySelector('.ce-actions')!.innerHTML = acts.map(([a, label]) => `<button type="button" class="dbg-btn" data-ce="${a}">${label}</button>`).join('');

    root.querySelector('.ce-cmp')!.innerHTML =
      `<thead><tr><th></th>${TYPES.map((t) => `<th class="${t === type ? 'on' : ''}">${NAME[t]}</th>`).join('')}</tr></thead>` +
      `<tbody>${ROWS.map(([label, vals]) => `<tr><th scope="row">${label}</th>${TYPES.map((t) => `<td class="${t === type ? 'on' : ''}">${vals[t]}</td>`).join('')}</tr>`).join('')}</tbody>`;

    markSeg(root, 'm', type);
    status(root, note ?? retentionNote(here));
    syncUrl({ m: type });
  }

  function retentionNote(here: boolean) {
    if (type === 'sram') return powered
      ? 'The latch drives the bit continuously, so SRAM holds it with no refresh and reads it in about a nanosecond — as long as the power is on.'
      : 'Power gone: an SRAM latch has nothing to drive it, so the bit is lost immediately. SRAM is volatile.';
    if (type === 'dram') return !powered ? 'Power gone, and the capacitor with it: DRAM is volatile.'
      : here ? 'The bit is charge on a capacitor. Press Wait and watch it leak away; Refresh tops it back up, which the memory controller does for every row every ~64 ms.'
        : 'The capacitor drained below the sense threshold, so the bit is gone. This is why DRAM must be refreshed before the charge fades.';
    return here ? 'Flash traps charge on an isolated gate, so it keeps the bit with the power off, for years. Programming and erasing slowly wear the cell, and erase only works a whole block at a time.'
      : 'The block is erased (all 1s). You can program bits to 0 individually, but setting any bit back to 1 needs another full-block erase.';
  }

  draw();
  root.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLElement>('[data-ce]')?.dataset.ce;
    const ty = (e.target as Element).closest<HTMLElement>('[data-m]')?.dataset.m as Mem | undefined;
    if (ty) { type = ty; powered = true; charge = 100; }
    else if (a === 'cut') powered = false;
    else if (a === 'on') { powered = true; if (type === 'dram') charge = 100; }
    else if (a === 'wait') charge = Math.max(0, charge - 55);
    else if (a === 'refresh') charge = 100;
    else if (a === 'erase') { charge = 0; erases++; }
    else if (a === 'prog') { charge = 100; erases++; }
    else return;
    draw();
  });
}
