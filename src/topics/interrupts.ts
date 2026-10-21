/**
 * Interrupts, drawn as a software trace timeline: one lane per thread of execution (the main loop and each interrupt
 * handler), time left to right, with the lane that holds the CPU highlighted. A tiny priority-preemption simulator
 * produces the segments, so the nesting and the return order are correct by construction.
 */
import { plural, stepper, traceHtml, type Bar, type BarKind, type Lane as TLane, type Mark, type Step } from './timeline';

export type Lane = 'main' | 'systick' | 'uart';
export const LANES: Lane[] = ['main', 'systick', 'uart'];
export const LANE_NAME: Record<Lane, string> = { main: 'main()', systick: 'SysTick', uart: 'UART RX' };
/** Lower number is more urgent, as on a Cortex-M. main() is the background, with the least urgent "priority". */
export const PRIO: Record<Lane, number> = { main: 256, systick: 2, uart: 1 };
/** Each handler's address in the vector table, for the side panel. */
export interface Arrival { lane: Lane; t: number; work: number }

export interface Seg {
  lane: Lane;
  t0: number;
  t1: number;
  /** stack = the processor saving its 8-register frame; handler = the handler code; unstack = the exception return. */
  kind: 'run' | 'stack' | 'handler' | 'unstack';
  /** Interrupt frames saved on the stack while this segment runs (0 in main()). */
  depth: number;
  note: string;
}

const STACK = 1;
const UNSTACK = 1;

/** The scenario the page plays: SysTick ticks, and a UART byte arrives mid-tick and preempts it. */
export const ARRIVALS: Arrival[] = [
  { lane: 'systick', t: 20, work: 12 },
  { lane: 'uart', t: 25, work: 6 },
  { lane: 'systick', t: 60, work: 12 },
];
export const END = 90;

/**
 * Simulates one CPU with priority preemption: a higher-priority interrupt preempts a running handler (it stacks again
 * and runs), and handlers return in last-in, first-out order. Exported so the checks can verify those invariants.
 */
export function trace(arrivals: Arrival[] = ARRIVALS, end = END): Seg[] {
  const segs: Seg[] = [];
  interface Ctx { lane: Lane; prio: number; work: number; ran: boolean }
  const stack: Ctx[] = [{ lane: 'main', prio: PRIO.main, work: Infinity, ran: true }];
  const pend = arrivals.map((a) => ({ ...a, prio: PRIO[a.lane], taken: false }));
  const under = () => LANE_NAME[stack[stack.length - 2]?.lane ?? 'main'];
  const take = (a: typeof pend[number], t: number, from: Lane) => {
    const preempt = from !== 'main';
    segs.push({ lane: a.lane, t0: t, t1: t + STACK, kind: 'stack', depth: stack.length,
      note: preempt
        ? `${LANE_NAME[a.lane]} fires while ${LANE_NAME[from]} is still running. It is higher priority, so it preempts: the processor stacks a second 8-register frame and vectors to ${LANE_NAME[a.lane]}.`
        : `${LANE_NAME[a.lane]} fires. The processor finishes its instruction, automatically pushes 8 registers (xPSR, PC, LR, R12, R3–R0) onto the stack, and reads ${LANE_NAME[a.lane]}’s address from the vector table.` });
    a.taken = true;
    stack.push({ lane: a.lane, prio: a.prio, work: a.work, ran: false });
  };

  let t = 0;
  for (let guard = 0; t < end && guard < 1000; guard++) {
    const cur = stack[stack.length - 1];
    const now = pend.find((a) => !a.taken && a.t <= t && a.prio < cur.prio);
    if (now) { take(now, t, cur.lane); t += STACK; continue; }
    if (cur.lane === 'main') {
      const a = pend.find((x) => !x.taken);
      const until = a ? Math.min(a.t, end) : end;
      if (until > t) segs.push({ lane: 'main', t0: t, t1: until, kind: 'run', depth: 0,
        note: 'The main loop runs. No interrupt is active, so the stack holds no saved frame.' });
      t = a ? Math.max(t, a.t) : end;
      continue;
    }
    const fut = pend.find((a) => !a.taken && a.t > t && a.prio < cur.prio);
    const finish = t + cur.work;
    const stop = fut && fut.t < finish ? fut.t : finish;
    if (stop > t) {
      segs.push({ lane: cur.lane, t0: t, t1: stop, kind: 'handler', depth: stack.length - 1,
        note: cur.ran
          ? `${LANE_NAME[cur.lane]}’s handler resumes exactly where it was preempted.`
          : `${LANE_NAME[cur.lane]}’s handler runs. Its priority is ${cur.prio}; a lower-numbered interrupt could still preempt it.` });
      cur.work -= stop - t;
      cur.ran = true;
      t = stop;
    }
    if (cur.work <= 1e-9) {
      segs.push({ lane: cur.lane, t0: t, t1: t + UNSTACK, kind: 'unstack', depth: stack.length - 2,
        note: `${LANE_NAME[cur.lane]}’s handler returns. The exception return pops the 8 saved registers and resumes ${under()}.` });
      t += UNSTACK;
      stack.pop();
    }
  }
  return segs;
}

const COLOR: Record<Lane, string> = { main: 'var(--ln-dim)', systick: 'var(--ch2)', uart: 'var(--ch6)' };
const BAR: Record<Seg['kind'], BarKind> = { run: 'bg', stack: 'hatch', handler: 'run', unstack: 'hatch' };

export function mountInterrupts(root: HTMLElement) {
  const segs = trace();

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Interrupting the program</p>
      <h1>Interrupts</h1>
      <p>A processor runs one instruction stream at a time, but the world does not wait for it. When a timer expires or a
        byte arrives, the hardware interrupts whatever is running, jumps to a handler, and returns to exactly where it
        left off. Each lane below is one thread of execution; the bright bar is what holds the CPU at that moment. Step
        through a SysTick tick that a UART byte interrupts partway. New to SysTick, the NVIC or the vector table? Start
        with <a href="?p=mcu" data-nav>Parts and terms</a>.</p>
    </section>
    ${traceHtml({ label: 'Interrupt trace timeline', title: 'Cortex-M4 · interrupt trace' })}
    <section class="prose">
      <h2>What the processor does automatically</h2>
      <p>On a Cortex-M, taking an interrupt is hardware, not code. The processor finishes the current instruction, pushes
        eight registers, xPSR, the return address, LR, R12 and R3–R0, onto the current stack, loads the handler’s address
        from the vector table at the start of memory, and starts running it. The handler is an ordinary C function; it
        returns with a normal return, which the processor recognises, by a special value left in LR, as the cue to pop
        those eight registers and resume. Because the compiler-saved registers are already preserved, a handler can call
        other functions without any special annotation.</p>
      <h2>Priority and nesting</h2>
      <p>Each interrupt has a priority, and on Cortex-M a lower number is more urgent. A handler can itself be interrupted
        by a higher-priority one, which is the preemption shown above: the UART byte arrives while SysTick is running,
        and because it is more urgent it runs first, stacking a second frame. Handlers always return in the reverse of
        the order they were entered, so the stack unwinds cleanly. An interrupt that is not more urgent than what is
        running stays pending until the CPU is free.</p>
      <h2>Latency and tail-chaining</h2>
      <p>The time from an interrupt firing to its handler’s first instruction is the interrupt latency, about twelve
        cycles on a Cortex-M4, most of it the register stacking. If a second interrupt is already pending when a handler
        returns, the processor skips the pop and the next push and goes straight to it, called tail-chaining, which saves
        that work. Keeping handlers short is what keeps the whole system responsive, because everything of lower priority
        waits behind them.</p>
    </section>`;

  const lanes: TLane[] = LANES.map((l) => ({ id: l, name: LANE_NAME[l], sub: l === 'main' ? 'background' : `priority ${PRIO[l]}`, color: COLOR[l] }));
  const bars: Bar[] = segs.map((s) => ({ lane: s.lane, t0: s.t0, t1: s.t1, kind: BAR[s.kind] }));
  const marks: Mark[] = ARRIVALS.map((a) => ({ lane: a.lane, t: a.t, kind: 'fire', title: `${LANE_NAME[a.lane]} fires` }));
  const steps: Step[] = segs.map((s, i) => ({
    bar: i, at: s.t1, lane: s.lane, note: s.note,
    readout: [`t = ${s.t1} µs`, `CPU: <b>${LANE_NAME[s.lane]}${s.kind === 'stack' ? ' (stacking)' : s.kind === 'unstack' ? ' (returning)' : ''}</b>`,
      `Stack: ${plural(s.depth, 'frame')}`],
  }));
  stepper(root).load({ lanes, bars, marks, end: END, every: 10 }, steps);
}
