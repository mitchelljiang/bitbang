/**
 * The bus matrix: the core, the DMA engines and the memories are not on one shared bus but on a crossbar that lets
 * several transfers happen at once, as long as they touch different slaves. Point each master at a slave and watch the
 * matrix run them in parallel, or arbitrate when two want the same memory. arbitrate is exported for the checks.
 */
import { status, syncUrl } from './dbg';

export interface Master { id: string; name: string; note: string }
export interface Slave { id: string; name: string; addr: string }

/** The bus masters, in arbitration priority order (highest first): the core wins a tie, then DMA2, then DMA1. */
export const MASTERS: Master[] = [
  { id: 'cpu', name: 'Cortex-M4', note: 'fetching instructions and loading data' },
  { id: 'dma2', name: 'DMA2', note: 'moving data for high-speed peripherals' },
  { id: 'dma1', name: 'DMA1', note: 'moving data for the slower peripheral bus' },
];

/** The bus slaves: the things a master can reach. */
export const SLAVES: Slave[] = [
  { id: 'flash', name: 'Flash', addr: '0x08000000' },
  { id: 'sram1', name: 'SRAM1', addr: '0x20000000' },
  { id: 'sram2', name: 'SRAM2', addr: '0x2001C000' },
  { id: 'periph', name: 'Peripherals', addr: '0x40000000' },
];

export type Grant = 'go' | 'wait';

/**
 * The arbiter's decision for one cycle. A master proceeds unless a higher-priority master wants the same slave; then it
 * waits a cycle. Masters pointed at different slaves all proceed at once, which is the whole point of the matrix.
 * `targets` maps master id → slave id. Returns master id → 'go' | 'wait'.
 */
export function arbitrate(targets: Record<string, string>): Record<string, Grant> {
  const taken = new Set<string>();
  const out: Record<string, Grant> = {};
  for (const m of MASTERS) {
    const s = targets[m.id];
    if (!s) { out[m.id] = 'wait'; continue; }
    if (taken.has(s)) out[m.id] = 'wait';
    else { taken.add(s); out[m.id] = 'go'; }
  }
  return out;
}

export function mountInterconnect(root: HTMLElement) {
  const def: Record<string, string> = { cpu: 'flash', dma2: 'sram2', dma1: 'sram1' };
  const q = new URLSearchParams(location.search).get('t');
  const targets: Record<string, string> = { ...def };
  if (q) q.split(',').forEach((pair) => { const [m, s] = pair.split(':'); if (MASTERS.some((x) => x.id === m) && SLAVES.some((x) => x.id === s)) targets[m] = s; });

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The address space</p>
      <h1>Buses and the bus matrix</h1>
      <p>A simple microcontroller puts the processor and all its memory on one shared bus, so only one transfer happens
        at a time. A Cortex-M4 instead has a <b>bus matrix</b>: a crossbar where several masters, the core and the DMA
        engines, each connect to several slaves, the Flash, the RAMs and the peripheral bus. Transfers to different
        slaves run at the same time; only when two masters want the same slave does one wait. Point each master at a
        slave below.</p>
    </section>
    <section class="debugger mem xbar" aria-label="Bus matrix">
      <header class="dbg-bar">
        <span class="dbg-file">bus matrix</span>
        <span class="dbg-state"><i aria-hidden="true"></i>one cycle</span>
        <button type="button" class="dbg-btn" data-act="reset" style="margin-left:auto">Reset</button>
      </header>
      <div class="xbar-body"></div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Why a crossbar, not a bus</h2>
      <p>Direct memory access is the reason. A DMA engine copying a buffer from SRAM to a UART should not stop the core
        from running code out of Flash: the two touch different memories, so there is no reason they cannot happen at
        once. The matrix makes that physical. Each master has its own path to each slave, and the arbiters sit at the
        slaves, not on one shared wire, so <code>N</code> masters hitting <code>N</code> different slaves all proceed in
        parallel. This is how a DMA transfer can run “in the background” while the CPU keeps working.</p>
      <h2>When two want the same memory</h2>
      <p>The parallelism ends at a shared slave. If the core and a DMA engine both access SRAM1 in the same cycle, the
        slave’s arbiter grants one and makes the other wait a cycle. The STM32 matrix arbitrates round-robin by default,
        so no master is starved; it can also be set to fixed priority. The waiting master is not told anything, it simply
        sees its access take an extra cycle, which is why heavy DMA traffic can quietly slow down code that shares a RAM
        with it. Splitting hot data across SRAM1 and SRAM2 so the core and DMA stay on different slaves is a common
        firmware optimisation.</p>
      <h2>The core’s two buses</h2>
      <p>The Cortex-M4 itself appears to the matrix as more than one master: it fetches instructions on one bus and loads
        and stores data on another, so running code from Flash while reading a variable from SRAM is already two
        parallel accesses. Keeping code in Flash and data in RAM is not just about size, it keeps the instruction and
        data streams on separate slaves so neither waits for the other.</p>
    </section>`;

  function draw(note?: string) {
    const grant = arbitrate(targets);
    const contended = new Set(SLAVES.filter((s) => MASTERS.filter((m) => targets[m.id] === s.id).length > 1).map((s) => s.id));
    const going = MASTERS.filter((m) => grant[m.id] === 'go').length;

    const head = `<div class="xb-row xb-headrow"><span class="xb-corner">master ╲ slave</span>${SLAVES.map((s) =>
      `<span class="xb-slave${contended.has(s.id) ? ' busy' : ''}">${s.name}<small>${s.addr}</small></span>`).join('')}</div>`;
    const rows = MASTERS.map((m) => {
      const cells = SLAVES.map((s) => {
        const on = targets[m.id] === s.id;
        const cls = ['xb-cell', on ? 'on' : '', on && grant[m.id] === 'wait' ? 'wait' : '', on && grant[m.id] === 'go' ? 'go' : ''].filter(Boolean).join(' ');
        return `<button type="button" class="${cls}" data-master="${m.id}" data-slave="${s.id}" aria-pressed="${on}" aria-label="${m.name} to ${s.name}">${on ? (grant[m.id] === 'go' ? '●' : '◴') : ''}</button>`;
      }).join('');
      return `<div class="xb-row"><span class="xb-master">${m.name}<small>${m.note}</small></span>${cells}</div>`;
    }).join('');
    root.querySelector('.xbar-body')!.innerHTML = head + rows +
      `<p class="xb-key"><span><b class="k-go">●</b> proceeds</span><span><b class="k-wait">◴</b> waits a cycle</span></p>`;

    if (!note) {
      if (!contended.size) note = `All ${going} masters reach different slaves, so every transfer runs this cycle, in parallel. This is the matrix doing its job.`;
      else {
        const waiters = MASTERS.filter((m) => grant[m.id] === 'wait');
        const slave = SLAVES.find((s) => contended.has(s.id))!;
        note = `${slave.name} is wanted by more than one master. The arbiter grants the highest-priority one and ${waiters.map((w) => w.name).join(' and ')} wait${waiters.length === 1 ? 's' : ''} a cycle. Next cycle round-robin gives the waiter its turn.`;
      }
    }
    status(root, note);
    syncUrl({ t: MASTERS.map((m) => `${m.id}:${targets[m.id]}`).join(',') });
  }

  draw();
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const cell = t.closest<HTMLElement>('[data-master][data-slave]');
    const act = t.closest<HTMLElement>('[data-act]');
    if (cell) { targets[cell.dataset.master!] = cell.dataset.slave!; draw(); }
    else if (act) { Object.assign(targets, def); draw('Back to the core on Flash and the two DMA engines on separate RAMs: no contention, all three in parallel.'); }
  });
}
