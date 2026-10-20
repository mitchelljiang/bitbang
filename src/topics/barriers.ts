/**
 * Memory ordering and barriers. A store does not happen when its instruction runs: it goes into a write buffer and
 * reaches RAM or a peripheral some cycles later, and stores to different places can land out of order. Four cases where
 * that matters, each with the barriers that fix it. A small executor turns the program into times: when each instruction
 * runs, when each store issues and lands, and when DMB, DSB and ISB hold things back, following the ARMv7-M rules.
 * Latencies are illustrative, a few cycles, chosen so the order of events matches what real hardware can do.
 */
import { markSeg, oneOf, seg, syncUrl } from './dbg';
import { stepper, traceHtml, type Bar, type Lane, type Step } from './timeline';

export type Case = 'irq' | 'dma' | 'lock' | 'mpu';
export type Barrier = 'none' | 'dmb' | 'dsb' | 'dsbisb';
export const CASES: Case[] = ['irq', 'dma', 'lock', 'mpu'];
/** The barriers each case offers: none, and the one (or two) that fix it. */
export const OPTIONS: Record<Case, Barrier[]> = { irq: ['none', 'dsb'], dma: ['none', 'dmb'], lock: ['none', 'dmb'], mpu: ['none', 'dsb', 'dsbisb'] };

type Op = { st: string; label: string; lat: number } | { bar: 'dmb' | 'dsb' | 'isb' } | { other: string };
export interface Store { target: string; label: string; issue: number; land: number }
export interface Ins { t0: number; t1: number; label: string; kind: 'run' | 'hatch' | 'ready'; waitFrom?: number }

/**
 * Runs a straight-line program on one core. An instruction takes one cycle. A store leaves the core as it finishes and
 * lands `lat` cycles later. DMB: no memory access after it may issue until every access before it has landed. DSB: no instruction
 * after it runs until every access before it has landed. ISB: flushes the pipeline, so the next instructions are fetched
 * again, which takes two cycles here.
 */
export function execute(prog: Op[]): { ins: Ins[]; stores: Store[]; t: number } {
  const ins: Ins[] = [];
  const stores: Store[] = [];
  let t = 0, fence = 0;
  const landed = () => Math.max(0, ...stores.map((s) => s.land));
  for (const op of prog) {
    if ('st' in op) {
      const from = t;
      t = Math.max(t, fence);
      if (t > from) ins.push({ t0: from, t1: t, label: 'waits', kind: 'ready' });
      ins.push({ t0: t, t1: t + 1, label: op.label, kind: 'run' });
      stores.push({ target: op.st, label: op.label, issue: t + 1, land: t + 1 + op.lat });
      t += 1;
    } else if ('bar' in op && op.bar === 'dmb') {
      ins.push({ t0: t, t1: t + 1, label: 'DMB', kind: 'hatch' });
      fence = landed();
      t += 1;
    } else if ('bar' in op && op.bar === 'dsb') {
      const until = Math.max(t + 1, landed());
      ins.push({ t0: t, t1: until, label: 'DSB', kind: 'hatch' });
      t = until;
    } else if ('bar' in op) {
      ins.push({ t0: t, t1: t + 2, label: 'ISB', kind: 'hatch' });
      t += 2;
    } else {
      ins.push({ t0: t, t1: t + 1, label: op.other, kind: 'run' });
      t += 1;
    }
  }
  return { ins, stores, t };
}

const fences = (b: Barrier): Op[] => (b === 'dmb' ? [{ bar: 'dmb' }] : b === 'dsb' ? [{ bar: 'dsb' }] : b === 'dsbisb' ? [{ bar: 'dsb' }, { bar: 'isb' }] : []);

/** What happened, as a bar on the case's last lane: ok, failed, or not guaranteed. */
export interface Effect { lane: string; t0: number; t1: number; kind: 'ok' | 'fail' | 'warn'; label: string; note: string }
export interface Run {
  ins: Ins[];
  stores: Store[];
  /** A second core, for the lock case. */
  ins2: Ins[];
  effect: Effect;
  outcome: 'ok' | 'fail' | 'warn';
  end: number;
}

/** Runs one case with one barrier choice. */
export function order(c: Case, b: Barrier): Run {
  const end = 10;
  if (c === 'irq') {
    // The handler clears TIM2's update flag (on APB1, a slow bus), then returns. The NVIC decides at the return
    // whether the interrupt is still pending, from the flag as the peripheral sees it.
    const r = execute([{ st: 'sr', label: 'STR SR', lat: 4 }, ...fences(b), { other: 'BX LR' }]);
    const ret = r.t, land = r.stores[0].land;
    const again = land > ret;
    return { ...r, ins2: [], end, outcome: again ? 'fail' : 'ok',
      effect: again
        ? { lane: 'nvic', t0: ret, t1: ret + 3, kind: 'fail', label: 'enters again', note: `The handler returns at cycle ${ret}, but the write clearing the flag is still on its way to TIM2 and lands at ${land}. At the return the NVIC still sees TIM2’s interrupt pending, so the processor <span class="bad">enters the same handler again</span>, for an interrupt that already happened. Harmless here, but it doubles the work, and a counting handler counts twice.` }
        : { lane: 'nvic', t0: ret, t1: ret + 3, kind: 'ok', label: 'returns to main()', note: `The DSB held the return until the write landed at cycle ${land}, so by the time the handler returns the flag is clear and the interrupt is no longer pending. <span class="good">The handler runs once.</span>` } };
  }
  if (c === 'dma') {
    // The descriptor is in normal RAM, the start bit in a DMA register. Normal and Device accesses are not ordered with
    // respect to each other, so the start can reach the DMA before the descriptor reaches RAM.
    const r = execute([{ st: 'desc', label: 'STR len', lat: 4 }, { st: 'desc', label: 'STR addr', lat: 4 }, ...fences(b), { st: 'cr', label: 'STR START', lat: 1 }]);
    const start = r.stores[2].land, ready = Math.max(r.stores[0].land, r.stores[1].land);
    const stale = start < ready;
    return { ...r, ins2: [], end, outcome: stale ? 'fail' : 'ok',
      effect: stale
        ? { lane: 'dma', t0: start, t1: start + 2, kind: 'fail', label: 'reads old desc', note: `The start bit lands at cycle ${start} and the DMA immediately reads its descriptor, but the new length and address do not reach RAM until ${ready}. <span class="bad">It copies with the old descriptor</span>: the wrong length, from the wrong address.` }
        : { lane: 'dma', t0: start, t1: start + 2, kind: 'ok', label: 'reads new desc', note: `The DMB made the start write wait until both descriptor writes had landed, at cycle ${ready}. When the DMA starts and reads the descriptor, <span class="good">it sees the new one</span>.` } };
  }
  if (c === 'lock') {
    // Core 0 writes the shared data, then releases the lock. Core 1 spins on the lock, then reads the data.
    const r = execute([{ st: 'shared', label: 'STR data', lat: 4 }, ...fences(b), { st: 'lock', label: 'STR lock', lat: 1 }]);
    const free = r.stores[1].land, data = r.stores[0].land;
    const ins2: Ins[] = [{ t0: 0, t1: free, label: 'spin: lock = 1', kind: 'run' }];
    let read = free;
    if (b === 'dmb') { ins2.push({ t0: free, t1: free + 1, label: 'DMB', kind: 'hatch' }); read += 1; }
    const stale = data > read;
    return { ...r, ins2, end, outcome: stale ? 'fail' : 'ok',
      effect: stale
        ? { lane: 'core1', t0: read, t1: read + 1, kind: 'fail', label: 'LDR → old', note: `Core 1 sees the lock free at cycle ${free}, takes it, and reads the data at ${read}. But core 0’s data write lands at ${data}: the lock release overtook it. <span class="bad">Core 1 reads the old data</span>, inside a critical section that was supposed to protect it.` }
        : { lane: 'core1', t0: read, t1: read + 1, kind: 'ok', label: 'LDR → new', note: `Core 0’s DMB held the lock release back until the data had landed, at cycle ${data}, and core 1’s DMB after taking the lock keeps its read from running early. <span class="good">Core 1 reads the new data.</span> These are the release and acquire barriers every lock has.` } };
  }
  // MPU: enable it, then make an access the MPU should fault, such as a write to a stack guard region.
  const r = execute([{ st: 'mpu', label: 'STR CTRL', lat: 2 }, ...fences(b), { st: 'guard', label: 'STR guard', lat: 1 }]);
  const on = r.stores[0].land, acc = r.ins[r.ins.length - 1].t0;
  const kind: Effect['kind'] = acc < on ? 'fail' : b === 'dsbisb' ? 'ok' : 'warn';
  return { ...r, ins2: [], end, outcome: kind,
    effect: kind === 'fail'
      ? { lane: 'check', t0: acc, t1: acc + 2, kind, label: 'not checked', note: `The guard write runs at cycle ${acc}, before the write enabling the MPU lands at ${on}. <span class="bad">The MPU is not on yet, so the write goes through</span> and corrupts the guard region it was meant to protect.` }
      : kind === 'warn'
        ? { lane: 'check', t0: acc, t1: acc + 2, kind, label: 'not guaranteed', note: `The DSB waited for the MPU write to land, so the MPU is on. But the guard write was fetched into the pipeline before that, and the architecture only promises that later instructions see the new MPU settings after an ISB. <span class="warn">It may fault, or may not.</span>` }
        : { lane: 'check', t0: acc, t1: acc + 2, kind, label: 'MemManage', note: `The DSB made sure the MPU write landed; the ISB threw away the instructions already fetched and fetched them again under the new settings. <span class="good">The guard write faults, as it should.</span> This DSB then ISB pair is what the CMSIS <code>ARM_MPU_Enable()</code> does.` } };
}

interface CaseDef { title: string; lanes: Lane[]; code: Record<Barrier, string>; intro: string; storeNote: (s: Store) => string }
const CASE: Record<Case, CaseDef> = {
  irq: {
    title: 'Clear a flag, return',
    lanes: [
      { id: 'cpu', name: 'TIM2 handler', sub: 'CPU', color: 'var(--ch2)' },
      { id: 'sr', name: 'TIM2→SR', sub: 'APB1 register', color: 'var(--ch4)', bus: true },
      { id: 'nvic', name: 'NVIC', sub: 'at the return', color: 'var(--ch6)' },
    ],
    intro: 'A timer interrupt handler clears the timer’s update flag, <code>TIM2-&gt;SR = 0</code>, and returns. TIM2 sits on APB1, behind a bus bridge, a few cycles away.',
    code: { none: '', dmb: '', dsb: '__DSB()', dsbisb: '' },
    storeNote: () => 'The store goes into the write buffer and on toward APB1. The CPU does not wait for it: as far as the pipeline is concerned, the instruction is done.',
  },
  dma: {
    title: 'Start a DMA',
    lanes: [
      { id: 'cpu', name: 'CPU', sub: 'Cortex-M7', color: 'var(--ch2)' },
      { id: 'desc', name: 'descriptor', sub: 'normal RAM', color: 'var(--ch4)', bus: true },
      { id: 'cr', name: 'DMA→CR', sub: 'device register', color: 'var(--ch5)', bus: true },
      { id: 'dma', name: 'DMA engine', sub: 'reads descriptor', color: 'var(--ch6)' },
    ],
    intro: 'The CPU fills in a DMA descriptor, the length and source address, in normal RAM, then writes the DMA’s start bit. Normal memory and device registers are reached by different paths.',
    code: { none: '', dmb: '__DMB()', dsb: '', dsbisb: '' },
    storeNote: (s) => s.target === 'desc' ? 'A descriptor write goes into the write buffer, bound for RAM. Normal memory is weakly ordered: the buffer may hold and merge it.' : 'The start-bit write goes out on the peripheral port, a short path to the DMA.',
  },
  lock: {
    title: 'Release a lock',
    lanes: [
      { id: 'cpu', name: 'Core 0', sub: 'releases', color: 'var(--ch2)' },
      { id: 'shared', name: 'data', sub: 'shared RAM', color: 'var(--ch4)', bus: true },
      { id: 'lock', name: 'lock', sub: 'shared RAM', color: 'var(--ch5)', bus: true },
      { id: 'core1', name: 'Core 1', sub: 'waits, then reads', color: 'var(--ch3)' },
    ],
    intro: 'Two cores share data behind a lock, as on a dual-core STM32H7. Core 0 holds the lock, writes the data, and releases the lock. Core 1 is spinning, waiting to take it and read the data.',
    code: { none: '', dmb: '__DMB()', dsb: '', dsbisb: '' },
    storeNote: (s) => s.target === 'shared' ? 'The data write misses in the cache and takes several cycles to become visible to the other core.' : 'The lock write hits and becomes visible to core 1 quickly.',
  },
  mpu: {
    title: 'Turn on the MPU',
    lanes: [
      { id: 'cpu', name: 'CPU', sub: 'privileged', color: 'var(--ch2)' },
      { id: 'mpu', name: 'MPU→CTRL', sub: 'system register', color: 'var(--ch4)', bus: true },
      { id: 'check', name: 'guard write', sub: 'MPU check', color: 'var(--ch6)' },
    ],
    intro: 'Startup code enables the MPU with a no-access guard region below the stack, then, to test it, writes into the guard. That write should fault.',
    code: { none: '', dmb: '', dsb: '__DSB()', dsbisb: '__DSB(); __ISB()' },
    storeNote: () => 'The MPU control write goes out on the private peripheral bus. Until it lands, the MPU is still off.',
  },
};
const VALUES: Record<string, [string, string]> = { sr: ['UIF = 1', 'UIF = 0'], desc: ['old', 'new'], cr: ['idle', 'START'], shared: ['old', 'new'], lock: ['1, held', '0, free'], mpu: ['off', 'on'] };
const BARRIER_TEXT: Record<Barrier, string> = { none: 'No barrier', dmb: 'DMB', dsb: 'DSB', dsbisb: 'DSB + ISB' };
const BARRIER_NOTE: Record<string, string> = {
  DMB: '<code>dmb</code>, a data memory barrier: no memory access after it may happen until every access before it has completed. Instructions that do not touch memory carry on.',
  DSB: '<code>dsb</code>, a data synchronization barrier: nothing after it runs at all until every memory access before it has completed. The CPU stalls here until the write buffer drains.',
  ISB: '<code>isb</code>, an instruction synchronization barrier: it flushes the pipeline, so every instruction after it is fetched again and sees the system state as it is now.',
};

export function mountBarriers(root: HTMLElement) {
  let c = oneOf<Case>('c', CASES, 'irq');
  let b = oneOf<Barrier>('b', ['none', 'dmb', 'dsb', 'dsbisb'], 'none');
  if (!OPTIONS[c].includes(b)) b = 'none';

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Sharing data safely</p>
      <h1>Memory ordering and barriers</h1>
      <p>A store instruction finishes long before its data arrives. It drops the write into a buffer and moves on, and
        writes to different places can arrive in a different order than the program made them. Usually nobody can tell.
        Here are four cases where somebody can: pick one, try it without a barrier, then with the barrier that fixes it.</p>
    </section>
    ${traceHtml({ label: 'Memory ordering trace', title: 'Cortex-M · write buffer and barriers', cls: 'barriers',
      controls: `${seg('c', 'Case', CASES.map((k) => [k, CASE[k].title]))}<span class="mb-bar"></span>` })}
    <section class="prose">
      <h2>Why the order can change</h2>
      <p>To keep the pipeline moving, a core does not wait for a store to finish. It hands the write to a write buffer
        and runs the next instruction. The write then travels to its destination: a cache line, a RAM bank across the bus
        matrix, or a peripheral behind one or two bus bridges, and those trips take different times. The architecture
        defines how much reordering is allowed. Accesses to Device memory, the peripherals, stay in order with each
        other. Accesses to normal memory may be reordered, merged or delayed, and normal and Device accesses are not
        ordered with respect to each other at all. Cortex-M3 and M4 rarely exploit this; Cortex-M7, with its caches and
        separate memory and peripheral ports, and any multi-core chip, do.</p>
      <h2>The three barriers</h2>
      <p><code>DMB</code> orders memory accesses: everything before it is complete, as seen by everyone, before anything
        after it starts. That is what a lock and a DMA hand-off need. <code>DSB</code> is stronger: no instruction at all
        runs until earlier accesses are complete, which is what you need when the next thing is not a memory access, such
        as returning from an interrupt, sleeping with <code>WFI</code>, or relying on a system register you just wrote.
        <code>ISB</code> flushes the pipeline, so instructions already fetched are fetched again under the new settings; it
        follows a DSB after changing the MPU, the vector table, or the CONTROL register.</p>
      <h2>Locks need both sides, and so does the compiler</h2>
      <p>Every lock pairs two barriers. Releasing it needs a DMB before the store that frees it, so the protected data is
        visible first; taking it needs a DMB after the successful <code>strex</code>, so reads of the data cannot run
        before the lock is held. C11 atomics with acquire and release ordering, and RTOS mutexes, emit these for you. The
        compiler can reorder too: <code>volatile</code> accesses stay in order with each other, but ordinary loads and
        stores may move across them. A compiler barrier, <code>asm volatile("" ::: "memory")</code>, stops that, and every
        CMSIS barrier intrinsic includes one. On a single-core Cortex-M4 the compiler barrier is usually the one that
        matters; on anything bigger, both do. See <a href="?p=atomics">atomics</a> and <a href="?p=locks">mutexes</a>.</p>
    </section>`;

  const st = stepper(root);
  function load() {
    const r = order(c, b);
    const def = CASE[c];
    const lanes: Lane[] = def.lanes.map((l) => ({ ...l }));
    const bars: Bar[] = [];
    const steps: (Step & { order: number })[] = [];
    const add = (bar: Bar, note: string | null, readout: string[], at = bar.t1, lane = bar.lane, ord = 0) => {
      bars.push(bar);
      if (note !== null) steps.push({ bar: bars.length - 1, at, lane, note, readout, order: ord });
    };
    const inFlight = (t: number) => r.stores.filter((s) => s.issue <= t && s.land > t).length;
    const ro = (t: number, extra: string[] = []) => [`cycle <b>${t}</b>`, `Writes in flight: <b>${inFlight(t)}</b>`, ...extra];
    // CPU instructions, then core 1's for the lock case.
    const cpuLane = 'cpu';
    for (const i of r.ins) {
      const s = r.stores.find((x) => x.issue === i.t1 && x.label === i.label);
      const note = i.kind === 'ready' ? 'The next store has to wait here: the DMB does not let it issue until every earlier access has landed.'
        : BARRIER_NOTE[i.label] ?? (s ? `<code>${i.label.toLowerCase()}</code> runs. ${def.storeNote(s)}` : i.label === 'BX LR' ? 'The handler returns: <code>bx lr</code> with the exception-return value in LR.' : `${i.label} runs.`);
      add({ lane: cpuLane, t0: i.t0, t1: i.t1, kind: i.kind, label: i.label }, note, ro(i.t1));
    }
    for (const i of r.ins2) add({ lane: 'core1', t0: i.t0, t1: i.t1, kind: i.kind, label: i.label },
      i.label === 'DMB' ? 'Core 1 runs the acquire barrier right after taking the lock, so its reads of the data cannot happen before the lock is held.' : null, ro(i.t1));
    // Each store's destination: the old value, in flight, then the new value once it lands.
    const targets = [...new Set(r.stores.map((s) => s.target))].filter((tg) => lanes.some((l) => l.id === tg));
    for (const tg of targets) {
      const ss = r.stores.filter((s) => s.target === tg);
      const first = Math.min(...ss.map((s) => s.issue)), last = Math.max(...ss.map((s) => s.land));
      const [was, now] = VALUES[tg];
      bars.push({ lane: tg, t0: 0, t1: first, kind: 'value', label: was });
      add({ lane: tg, t0: first, t1: last, kind: 'ready', label: 'in flight' },
        `The write${ss.length > 1 ? 's' : ''} to ${lanes.find((l) => l.id === tg)!.name} land${ss.length > 1 ? '' : 's'} at cycle ${last}, ${last - first} cycle${last - first === 1 ? '' : 's'} after issuing. Only now ${tg === 'mpu' ? 'is the MPU on' : 'can anyone else see the new value'}.`,
        ro(last), last, tg, 1);
      bars.push({ lane: tg, t0: last, t1: r.end, kind: 'value', label: now });
    }
    const e = r.effect;
    add({ lane: e.lane, t0: e.t0, t1: e.t1, kind: e.kind, label: e.label }, e.note,
      ro(e.t1, [`<span class="${e.kind === 'ok' ? 'good' : e.kind === 'fail' ? 'bad' : 'warn'}">${e.kind === 'ok' ? 'Correct' : e.kind === 'fail' ? 'Wrong order' : 'Not guaranteed'}</span>`]), e.t1, e.lane, 2);
    steps.sort((x, y) => x.at - y.at || x.order - y.order);
    const intro = `${def.intro} ${b === 'none' ? 'No barrier.' : `With <code>${def.code[b]}</code> after the first write${c === 'dma' ? 's' : ''}.`}`;
    steps.unshift({ ...steps[0], note: intro, at: 0, bar: -1, readout: ro(0) });
    st.load({ lanes, bars, end: r.end, every: 1 }, steps);
    root.querySelector('.mb-bar')!.innerHTML = seg('b', 'Barrier', OPTIONS[c].map((x) => [x, BARRIER_TEXT[x]]));
    markSeg(root, 'c', c);
    markSeg(root, 'b', b);
    syncUrl({ c, b });
  }
  load();

  root.addEventListener('click', (ev) => {
    const t = ev.target as Element;
    const cc = t.closest<HTMLElement>('[data-c]');
    const bb = t.closest<HTMLElement>('[data-b]');
    if (cc) { c = cc.dataset.c as Case; if (!OPTIONS[c].includes(b)) b = 'none'; load(); }
    else if (bb) { b = bb.dataset.b as Barrier; load(); }
  });
}
