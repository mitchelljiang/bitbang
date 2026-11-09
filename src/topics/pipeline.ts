/**
 * The pipeline page: instructions down the side, clock cycles across, and the stage each instruction is in. A small
 * simulator holds one instruction per stage. Execution times come from Arm's technical reference manuals for the
 * Cortex-M0+ and Cortex-M4; verify checks the simulator against the worked examples in those manuals.
 */
import { esc } from '../core/render';
import { markSeg, oneOf, reservedStatus, seg, stepButtons, syncUrl, walkthrough } from './dbg';

export const CORES = ['m0', 'm4'] as const;
export type Core = (typeof CORES)[number];
const STAGES: Record<Core, string[]> = { m0: ['F', 'E'], m4: ['F', 'D', 'E'] };
const STAGE_NAME: Record<string, string> = { F: 'Fetch', D: 'Decode', E: 'Execute' };

export interface Ins { t: string; kind: 'alu' | 'ldr' | 'str' | 'push' | 'branch'; rd?: number; base?: number; n?: number; taken?: boolean; target?: number }

/** How many cycles an instruction spends in Execute, given the one before it, on a system with no wait states. */
export function execCycles(i: Ins, prev: Ins | undefined, core: Core): { cycles: number; stall: number } {
  if (i.kind === 'push') return { cycles: 1 + (i.n ?? 1), stall: 0 };
  if (i.kind === 'alu' || i.kind === 'branch') return { cycles: 1, stall: 0 };
  if (core === 'm0') return { cycles: 2, stall: 0 };
  // Cortex-M4 TRM 3.3.3. A store's data goes to the write buffer while the next instruction runs. A load straight after
  // a load is pipelined with it, unless the first loaded the register the second needs. An address that depends on the
  // previous data-processing result costs a cycle, because there is no forwarding path to the address generator.
  const stall = prev?.kind === 'alu' && prev.rd === i.base ? 1 : 0;
  if (i.kind === 'str') return { cycles: 1, stall };
  return { cycles: prev?.kind === 'ldr' && prev.rd !== i.base ? 1 : 2, stall };
}

export type Cell = 'F' | 'D' | 'E' | 'wait' | 'stall' | '';
export interface Row { ins: Ins; cells: Cell[]; flushed: boolean }
export interface Schedule { rows: Row[]; total: number; serial: number; retired: number; events: string[] }

interface Active { row: Row; left: number; stall: number; entered: number; started: boolean }

/** Runs a program cycle by cycle. Each stage holds one instruction; a taken branch throws away what is behind it. */
export function simulate(prog: Ins[], core: Core): Schedule {
  const names = STAGES[core], S = names.length;
  const stages: (Active | null)[] = new Array(S).fill(null);
  const rows: Row[] = [];
  const events: string[] = [];
  let pc = 0, prev: Ins | undefined, serial = 0, retired = 0, cycle = 0;
  for (; cycle < 80; cycle++) {
    if (!stages[0] && pc < prog.length) {
      const row: Row = { ins: prog[pc++], cells: [], flushed: false };
      rows.push(row);
      stages[0] = { row, left: 0, stall: 0, entered: cycle, started: false };
    }
    if (stages.every((x) => !x)) break;
    let note = '';
    const last = stages[S - 1];
    if (last && !last.started) {
      const c = execCycles(last.row.ins, prev, core);
      last.left = c.cycles + c.stall; last.stall = c.stall; last.started = true;
      serial += S - 1 + last.left;
    }
    stages.forEach((a, s) => {
      if (!a) return;
      let c: Cell;
      if (s === S - 1) c = a.stall > 0 ? 'stall' : 'E';
      else c = a.entered === cycle ? (names[s] as Cell) : 'wait';
      a.row.cells[cycle] = c;
    });
    if (last) {
      if (last.stall > 0) { last.stall--; note = `<code>${esc(last.row.ins.t)}</code> stalls: its address depends on the result the last instruction has only just produced, and there is no forwarding path to the address generator.`; }
      else if (last.left > 1) note = `<code>${esc(last.row.ins.t)}</code> takes more than one cycle in Execute, so everything behind it waits.`;
      last.left--;
      if (last.left === 0) {
        prev = last.row.ins; retired++;
        stages[S - 1] = null;
        if (last.row.ins.kind === 'branch' && last.row.ins.taken) {
          const n = stages.filter(Boolean).length;
          for (let s = 0; s < S; s++) { const a = stages[s]; if (a) a.row.flushed = true; stages[s] = null; }
          pc = last.row.ins.target!;
          note = n ? `The branch is taken. The ${n === 1 ? 'instruction' : `${n} instructions`} fetched behind it ${n === 1 ? 'is' : 'are'} on the wrong path and thrown away, and fetching restarts at the target.` : 'The branch is taken, and fetching restarts at the target.';
        }
      }
    }
    for (let s = S - 1; s > 0; s--) {
      if (!stages[s] && stages[s - 1]) { stages[s] = stages[s - 1]; stages[s]!.entered = cycle + 1; stages[s - 1] = null; }
    }
    events[cycle] = note;
  }
  return { rows, total: cycle, serial, retired, events };
}

const a = (t: string, rd?: number): Ins => ({ t, kind: 'alu', rd });
export const PROGRAMS: Record<string, { label: string; prog: Ins[]; say: string }> = {
  line: { label: 'Straight line', prog: [a('movs r0, #1', 0), a('adds r0, #2', 0), a('adds r1, r0, #1', 1), a('subs r2, r1, #1', 2), a('lsls r2, r2, #1', 2)], say: 'Five simple instructions. Once the pipeline is full, one finishes every cycle.' },
  loads: { label: 'Loads', prog: [{ t: 'ldr r0, [r1]', kind: 'ldr', rd: 0, base: 1 }, { t: 'ldr r2, [r3]', kind: 'ldr', rd: 2, base: 3 }, a('adds r0, r0, r2', 0), { t: 'str r0, [r1]', kind: 'str', base: 1 }], say: 'A load goes to memory, so it needs a second cycle. The Cortex-M4 overlaps back-to-back loads and hands stores to a write buffer.' },
  hazard: { label: 'Address stall', prog: [a('adds r1, #4', 1), { t: 'ldr r0, [r1]', kind: 'ldr', rd: 0, base: 1 }, a('adds r0, #1', 0)], say: 'The load’s address depends on the instruction right before it.' },
  branch: { label: 'Taken branch', prog: [a('cmp r0, #0'), { t: 'beq done', kind: 'branch', taken: true, target: 5 }, a('adds r1, #1', 1), a('adds r1, #2', 1), a('adds r1, #3', 1), a('movs r2, #1', 2), a('adds r2, #1', 2)], say: 'The branch is only resolved in Execute, by which time the next instructions have been fetched.' },
  push: { label: 'Push', prog: [{ t: 'push {r4-r7}', kind: 'push', n: 4 }, a('adds r0, #1', 0), a('adds r1, #1', 1)], say: 'A push writes one register per cycle, so it stays in Execute for a while.' },
};
const KEYS = Object.keys(PROGRAMS) as (keyof typeof PROGRAMS & string)[];
const CORE_LABEL: Record<Core, string> = { m0: 'Cortex-M0+ · 2 stages', m4: 'Cortex-M4 · 3 stages' };

/** The explanation for one cycle of a schedule. */
export function cycleSay(s: Schedule, core: Core, c: number) {
  const parts = STAGES[core].flatMap((st) => {
    const r = s.rows.find((x) => x.cells[c] === st || (st === 'E' && x.cells[c] === 'stall'));
    return r ? [`${STAGE_NAME[st]}: <code>${esc(r.ins.t)}</code>`] : [];
  });
  return `<b>Cycle ${c + 1}.</b> ${parts.join(' · ')}${s.events[c] ? `<br>${s.events[c]}` : ''}`;
}

export function mountPipeline(root: HTMLElement) {
  let core = oneOf('core', CORES, 'm4');
  let prog = oneOf('prog', KEYS, 'line');
  let at = 0;
  const all = CORES.flatMap((c) => KEYS.map((k) => simulate(PROGRAMS[k].prog, c)));
  const COLS = Math.max(...all.map((s) => s.total));
  const ROWS = Math.max(...all.map((s) => s.rows.length));

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Execution</p>
      <h1>Pipeline</h1>
      <p>Every instruction has to be fetched, decoded and executed. If the processor did those one after another it would
        need three cycles per instruction. Instead it overlaps them: while one instruction executes, the next is
        decoded and the one after that is fetched. Step through the cycles to see where that works and where it breaks
        down.</p>
    </section>
    <section class="debugger pipe" aria-label="Pipeline">
      <header class="dbg-bar">
        <span class="dbg-file">Cycles</span>
        <div class="dbg-controls">${seg('core', 'Processor', CORES.map((c) => [c, CORE_LABEL[c]]))}${stepButtons()}</div>
      </header>
      <div class="pp-tabs">${seg('prog', 'Program', KEYS.map((k) => [k, PROGRAMS[k].label]))}</div>
      <div class="pp-grid" style="--cols:${COLS}"></div>
      <div class="pp-read"></div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Overlap, not speed</h2>
      <p>A pipeline does not make any one instruction faster; the first one still takes three cycles from fetch to done.
        What it changes is how often one finishes: once it is full, every cycle. The stages also get shorter, because each
        does less, so the clock can run faster.</p>
      <h2>Short on purpose</h2>
      <p>The Cortex-M0+ has two stages and the Cortex-M3 and M4 have three. A long pipeline buys clock speed, but costs more
        cycles whenever it has to be thrown away and refilled. Microcontrollers care about responding promptly and using
        little energy. The Cortex-M7, built for higher clocks, has six stages and can start two instructions at once.</p>
      <h2>What the numbers leave out</h2>
      <p>These counts assume memory that answers in one cycle. Flash on a fast chip is slower than the core: at 168 MHz an
        STM32F4 needs 5 wait states, so a fetch would take 6 cycles if the chip did not read ahead and cache. A taken branch
        costs more there. The Cortex-M4’s branch refill is also 1 to 3 cycles depending on the width and alignment
        of the target; this diagram shows 2. See <a href="?p=branches" data-nav>branches</a> for what prediction does about
        it.</p>
    </section>`;

  const panel = root.querySelector<HTMLElement>('.pipe')!;
  const says = CORES.flatMap((c) => KEYS.flatMap((k) => { const s = simulate(PROGRAMS[k].prog, c); return [...s.events.map((_, i) => cycleSay(s, c, i))]; }));
  const say = reservedStatus(panel, says);
  const current = () => simulate(PROGRAMS[prog].prog, core);
  const w = walkthrough(root, { count: () => current().total, at: () => at, go: (i) => { at = i; draw(); } });

  function draw() {
    const s = current();
    const head = Array.from({ length: COLS }, (_, c) => `<span class="pp-h${c === at ? ' now' : ''}${c >= s.total ? ' off' : ''}">${c + 1}</span>`).join('');
    const body = Array.from({ length: ROWS }, (_, r) => {
      const row = s.rows[r];
      const cells = Array.from({ length: COLS }, (_, c) => {
        const k = row?.cells[c] ?? '';
        const shown = k && c <= at ? k : '';
        return `<span class="pp-c${c === at ? ' now' : ''}${shown ? ` k-${shown}` : ''}">${shown === 'wait' || shown === 'stall' || !shown ? '' : shown}</span>`;
      }).join('');
      return `<span class="pp-l${row?.flushed ? ' gone' : ''}">${row ? `<code>${esc(row.ins.t)}</code>` : ''}</span>${cells}`;
    }).join('');
    root.querySelector('.pp-grid')!.innerHTML = `<span class="pp-l head">Instruction</span>${head}${body}`;
    root.querySelector('.pp-read')!.innerHTML = `
      <span><b>${s.total}</b> cycles</span><span><b>${s.retired}</b> instructions</span>
      <span><b>${(s.total / s.retired).toFixed(2)}</b> cycles each</span><span class="dim">${s.serial} cycles if run one at a time</span>
      <span class="pp-key"><i class="k-wait"></i>waiting<i class="k-stall"></i>stalled</span>`;
    say(cycleSay(s, core, at));
    markSeg(root, 'core', core);
    markSeg(root, 'prog', prog);
    syncUrl({ core, prog });
    w.sync();
  }

  panel.addEventListener('click', (e) => {
    const t = e.target as Element;
    const c = t.closest<HTMLElement>('[data-core]'), p = t.closest<HTMLElement>('[data-prog]');
    if (c) core = c.dataset.core as Core;
    else if (p) prog = p.dataset.prog as string;
    else return;
    at = 0;
    draw();
  });
  draw();
}
