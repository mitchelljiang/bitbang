/**
 * Priorities and nesting: three interrupts with fixed arrival times, whose priorities the reader sets by clicking them
 * on their lanes. A small model of the Cortex-M NVIC turns those priorities into a trace: preemption by a strictly more
 * urgent interrupt, pending when not, ties broken by exception number, and tail-chaining on return.
 */
import { syncUrl } from './dbg';
import { plural, stepper, traceHtml, type Bar, type Lane, type Mark, type Step } from './timeline';

export type Irq = 'tim2' | 'usart2' | 'adc';
export interface IrqDef { id: Irq; name: string; irqn: number; t: number; work: number; color: string }
/** STM32F4 exception numbers: ADC is IRQ 18, TIM2 IRQ 28, USART2 IRQ 38. */
export const IRQS: IrqDef[] = [
  { id: 'tim2', name: 'TIM2', irqn: 28, t: 10, work: 16, color: 'var(--ch2)' },
  { id: 'usart2', name: 'USART2', irqn: 38, t: 16, work: 8, color: 'var(--ch6)' },
  { id: 'adc', name: 'ADC', irqn: 18, t: 20, work: 6, color: 'var(--ch5)' },
];
export const END = 60;
const MAIN = 256;
const STACK = 1;

export interface PSeg {
  lane: Irq | 'main';
  t0: number;
  t1: number;
  /** stack = entry from a running context; chain = tail-chained entry; run = handler or main; unstack = return. */
  kind: 'stack' | 'chain' | 'run' | 'unstack';
  depth: number;
  note: string;
}

export interface PTrace { segs: PSeg[]; pending: { id: Irq; t0: number; t1: number }[] }

/**
 * One CPU with an NVIC. An interrupt preempts only if its priority number is strictly lower than the running one's.
 * When a handler returns, the most urgent pending interrupt (lowest number, then lowest exception number) tail-chains
 * if it is more urgent than the context being returned to; otherwise the processor unstacks.
 */
export function nvic(prio: Record<Irq, number>, irqs: IrqDef[] = IRQS, end = END): PTrace {
  const name = (id: Irq | 'main') => (id === 'main' ? 'main()' : irqs.find((q) => q.id === id)!.name);
  const p = (id: Irq | 'main') => (id === 'main' ? MAIN : prio[id]);
  const segs: PSeg[] = [];
  const takenAt: Partial<Record<Irq, number>> = {};
  interface Ctx { id: Irq | 'main'; work: number; ran: boolean }
  const stack: Ctx[] = [{ id: 'main', work: Infinity, ran: true }];
  const waiting = (t: number) => irqs.filter((q) => q.t <= t && takenAt[q.id] === undefined)
    .sort((a, b) => prio[a.id] - prio[b.id] || a.irqn - b.irqn);
  const tie = (w: IrqDef[]) => w.length > 1 && prio[w[1].id] === prio[w[0].id]
    ? ` ${name(w[0].id)} and ${name(w[1].id)} are both pending at priority ${prio[w[0].id]}; the tie goes to the lower exception number, ${name(w[0].id)} (IRQ ${w[0].irqn}).` : '';
  // Why each interrupt that arrived during a stretch of work did not preempt it.
  const held = (cur: Irq, t0: number, t1: number) => irqs.filter((q) => q.t > t0 && q.t < t1 && q.id !== cur).map((q) =>
    ` ${name(q.id)} fires at ${q.t} µs with priority ${prio[q.id]}, ${prio[q.id] === prio[cur] ? 'the same as' : 'less urgent than'} ${name(cur)}’s ${prio[cur]}, so it cannot preempt: it stays pending.`).join('');

  let t = 0;
  for (let guard = 0; t < end && guard < 200; guard++) {
    const cur = stack[stack.length - 1];
    const w = waiting(t);
    if (w.length && prio[w[0].id] < p(cur.id)) {
      const q = w[0];
      segs.push({ lane: q.id, t0: t, t1: t + STACK, kind: 'stack', depth: stack.length,
        note: cur.id === 'main'
          ? `${q.name} fires. The processor stacks 8 registers and jumps to its handler, from the vector table entry for IRQ ${q.irqn}.${tie(w)}`
          : `${q.name} has priority ${prio[q.id]}, more urgent than ${name(cur.id)}’s ${p(cur.id)}, so it preempts: a second frame is stacked on top of ${name(cur.id)}’s and ${q.name}’s handler starts.${tie(w)}` });
      takenAt[q.id] = t;
      stack.push({ id: q.id, work: q.work, ran: false });
      t += STACK;
      continue;
    }
    if (cur.id === 'main') {
      const next = irqs.filter((q) => takenAt[q.id] === undefined).map((q) => q.t).sort((a, b) => a - b)[0];
      const until = Math.min(next ?? end, end);
      segs.push({ lane: 'main', t0: t, t1: until, kind: 'run', depth: 0,
        note: segs.length ? 'Every handler has returned and nothing is pending, so main() runs again with no saved frames.'
          : 'main() runs. No interrupt is active or pending.' });
      t = until;
      continue;
    }
    const id = cur.id;
    // Run until done, or until something more urgent than this handler arrives.
    const pre = irqs.filter((q) => takenAt[q.id] === undefined && q.t > t && prio[q.id] < prio[id]).map((q) => q.t).sort((a, b) => a - b)[0];
    const stop = Math.min(t + cur.work, pre ?? Infinity);
    segs.push({ lane: id, t0: t, t1: stop, kind: 'run', depth: stack.length - 1,
      note: (cur.ran ? `${name(id)}’s handler resumes exactly where it was preempted.` : `${name(id)}’s handler runs at priority ${prio[id]}.`) + held(id, t, stop) });
    cur.work -= stop - t;
    cur.ran = true;
    t = stop;
    if (cur.work > 0) continue;
    // Return: tail-chain to a pending interrupt more urgent than the context underneath, or unstack to it.
    const under = stack[stack.length - 2];
    const wr = waiting(t);
    stack.pop();
    if (wr.length && prio[wr[0].id] < p(under.id)) {
      const q = wr[0];
      segs.push({ lane: q.id, t0: t, t1: t + STACK, kind: 'chain', depth: stack.length,
        note: `${name(id)} returns, but ${q.name} is pending and more urgent than ${name(under.id)}, which it would return to. So the processor tail-chains: it skips popping and re-pushing the 8 registers and goes straight to ${q.name}.${tie(wr)}` });
      takenAt[q.id] = t;
      stack.push({ id: q.id, work: q.work, ran: false });
    } else {
      segs.push({ lane: id, t0: t, t1: t + STACK, kind: 'unstack', depth: stack.length - 1,
        note: `${name(id)} returns: the processor pops its 8 registers and resumes ${name(under.id)}.${wr.length
          ? ` ${name(wr[0].id)} is still pending, but at priority ${prio[wr[0].id]} it is not more urgent than ${name(under.id)}’s ${p(under.id)}, so it keeps waiting.` : ''}` });
    }
    t += STACK;
  }
  const pending = irqs.map((q) => ({ id: q.id, t0: q.t, t1: takenAt[q.id] ?? end })).filter((x) => x.t1 > x.t0);
  return { segs, pending };
}

/** Pending interrupts at time t: arrived and not yet entered. */
const pendingAt = (tr: PTrace, t: number) => tr.pending.filter((x) => x.t0 <= t && x.t1 > t).map((x) => x.id);

const DEFAULT: Record<Irq, number> = { tim2: 2, usart2: 1, adc: 3 };

export function mountPriorities(root: HTMLElement) {
  const q = new URLSearchParams(location.search).get('pr') ?? '';
  const prio: Record<Irq, number> = { ...DEFAULT };
  if (/^[0-3]{3}$/.test(q)) IRQS.forEach((x, i) => (prio[x.id] = Number(q[i])));

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Interrupting the program</p>
      <h1>Priorities and nesting</h1>
      <p>When two interrupts want the CPU, the interrupt controller decides by priority, and on a Cortex-M the lower number
        is the more urgent. Three peripherals, a timer (TIM2), a serial port (USART2) and an ADC, fire at fixed times
        below. Click a priority on its lane to change it, then step through and watch who preempts whom, who has to wait,
        and how handlers chain together on the way out. The names are introduced in
        <a href="?p=mcu" data-nav>Parts and terms</a>.</p>
    </section>
    ${traceHtml({ label: 'Interrupt priority trace', title: 'Cortex-M4 NVIC · priority trace',
      controls: '<button type="button" class="tr-btn" data-reset>Reset priorities</button>' })}
    <section class="prose">
      <h2>Lower number, more urgent</h2>
      <p>Every interrupt has a priority register in the NVIC. The architecture defines eight bits, but a chip implements
        only the top few: an STM32F4 has four, so sixteen levels, 0 to 15. Zero is the most urgent a configurable
        interrupt can be; only Reset, NMI and HardFault sit above it, at fixed negative priorities. A new interrupt
        preempts the running code only if its number is strictly lower than the running handler’s. Equal is not enough,
        which is why two handlers at the same priority never interrupt each other.</p>
      <h2>Pending, and how ties are broken</h2>
      <p>An interrupt that cannot preempt is not lost: the NVIC sets its pending bit, and it runs as soon as nothing more
        urgent is active. When several are pending at the same priority, the one with the lower exception number goes
        first, which is fixed by the chip’s vector table. Priorities can also be split into a group priority, which decides
        preemption, and a subpriority, which only orders pending interrupts within a group.</p>
      <h2>Tail-chaining</h2>
      <p>When a handler finishes and another interrupt is pending that is more urgent than the code underneath, there is no
        point popping eight registers only to push the same eight again. The processor skips both and jumps straight to
        the next handler, taking about six cycles on a Cortex-M4 instead of roughly twelve to unstack and twelve to stack
        again. The bars marked as a narrow hatch between two handlers are those chained entries.</p>
    </section>`;

  const st = stepper(root);
  function load() {
    const tr = nvic(prio);
    const name = (id: Irq | 'main') => (id === 'main' ? 'main()' : IRQS.find((x) => x.id === id)!.name);
    const lanes: Lane[] = [
      { id: 'main', name: 'main()', sub: 'background', color: 'var(--ln-dim)' },
      ...IRQS.map((x) => ({ id: x.id, name: x.name, color: x.color,
        sub: `<button type="button" class="tr-chip" data-prio="${x.id}" aria-label="${x.name} priority ${prio[x.id]}. Click to change.">prio ${prio[x.id]}</button> IRQ ${x.irqn}` })),
    ];
    const bars: Bar[] = tr.segs.map((s) => ({ lane: s.lane, t0: s.t0, t1: s.t1,
      kind: s.lane === 'main' ? 'bg' : s.kind === 'run' ? 'run' : 'hatch' }));
    bars.push(...tr.pending.map((x) => ({ lane: x.id, t0: x.t0, t1: x.t1, kind: 'ready' as const })));
    const marks: Mark[] = IRQS.map((x) => ({ lane: x.id, t: x.t, kind: 'fire', title: `${x.name} fires at ${x.t} µs` }));
    const steps: Step[] = tr.segs.map((s, i) => {
      const pend = pendingAt(tr, s.t1).filter((id) => id !== s.lane);
      const what = s.kind === 'stack' ? ' (stacking)' : s.kind === 'chain' ? ' (tail-chain)' : s.kind === 'unstack' ? ' (returning)' : '';
      return { bar: i, at: s.t1, lane: s.lane, note: s.note,
        readout: [`t = ${s.t1} µs`, `CPU: <b>${name(s.lane)}${what}</b>`, `Stack: ${plural(s.depth, 'frame')}`,
          `Pending: ${pend.length ? pend.map(name).join(', ') : 'none'}`] };
    });
    st.load({ lanes, bars, marks, end: END, every: 10 }, steps);
    syncUrl({ pr: IRQS.map((x) => prio[x.id]).join('') });
  }
  load();

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const chip = t.closest<HTMLElement>('[data-prio]');
    if (chip) {
      const id = chip.dataset.prio as Irq;
      prio[id] = (prio[id] + 1) % 4;
      load();
      root.querySelector<HTMLElement>(`[data-prio="${id}"]`)?.focus();
    } else if (t.closest('[data-reset]')) {
      Object.assign(prio, DEFAULT);
      load();
    }
  });
}
