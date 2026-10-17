/**
 * Interrupts, drawn as a software trace timeline: one lane per thread of execution (the main loop and each interrupt
 * handler), time left to right, with the lane that holds the CPU highlighted. A tiny priority-preemption simulator
 * produces the segments, so the nesting and the return order are correct by construction.
 */
import { esc } from '../core/render';

export type Lane = 'main' | 'systick' | 'uart';
export const LANES: Lane[] = ['main', 'systick', 'uart'];
export const LANE_NAME: Record<Lane, string> = { main: 'main()', systick: 'SysTick', uart: 'UART RX' };
/** Lower number is more urgent, as on a Cortex-M. main() is the background, with the least urgent "priority". */
export const PRIO: Record<Lane, number> = { main: 256, systick: 2, uart: 1 };
/** Each handler's address in the vector table, for the side panel. */
export const VECTOR: Record<Lane, number> = { main: 0x08000120, systick: 0x080003c4, uart: 0x08000418 };

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

const PCT = (t: number) => `${(t / END) * 100}%`;

export function mountInterrupts(root: HTMLElement) {
  const segs = trace();
  let at = 0;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Interrupting the program</p>
      <h1>Interrupts</h1>
      <p>A processor runs one instruction stream at a time, but the world does not wait for it. When a timer expires or a
        byte arrives, the hardware interrupts whatever is running, jumps to a handler, and returns to exactly where it
        left off. Each lane below is one thread of execution; the bright bar is what holds the CPU at that moment. Step
        through a SysTick tick that a UART byte interrupts partway.</p>
    </section>
    <section class="trace" aria-label="Interrupt trace timeline">
      <header class="tr-bar">
        <span class="tr-title">Cortex-M4 · interrupt trace</span>
        <div class="tr-controls">
          <button type="button" class="tr-btn" data-act="back">Back</button>
          <button type="button" class="tr-btn primary" data-act="step">Step</button>
          <button type="button" class="tr-btn" data-act="play">Play</button>
          <button type="button" class="tr-btn" data-act="restart">Restart</button>
        </div>
      </header>
      <div class="tr-readout">
        <span class="tr-now">t = 0 µs</span><span class="tr-cpu">CPU: main()</span><span class="tr-depth">Stack: 0 frames</span>
      </div>
      <div class="tr-grid">
        <div class="tr-ruler" aria-hidden="true"></div>
        ${LANES.map((l) => `
          <div class="tr-lane ln-${l}">
            <span class="tr-label"><b>${esc(LANE_NAME[l])}</b><small>${l === 'main' ? 'background' : `priority ${PRIO[l]}`}</small></span>
            <div class="tr-track" data-lane="${l}"></div>
          </div>`).join('')}
        <div class="tr-head" aria-hidden="true"></div>
      </div>
      <p class="tr-status" aria-live="polite"></p>
    </section>
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

  // Draw the fixed parts: the bars and the ruler.
  for (const l of LANES) {
    const track = root.querySelector<HTMLElement>(`.tr-track[data-lane="${l}"]`)!;
    track.innerHTML = segs.map((s, i) => s.lane === l
      ? `<span class="tr-seg k-${s.kind}" data-i="${i}" style="left:${PCT(s.t0)};width:${PCT(s.t1 - s.t0)}"></span>`
      : '').join('') +
      ARRIVALS.filter((a) => a.lane === l).map((a) => `<span class="tr-arrow" style="left:${PCT(a.t)}" title="${LANE_NAME[l]} fires"></span>`).join('');
  }
  const ruler = root.querySelector<HTMLElement>('.tr-ruler')!;
  ruler.innerHTML = Array.from({ length: END / 10 + 1 }, (_, k) =>
    `<span class="tr-tick" style="left:${PCT(k * 10)}">${k * 10}</span>`).join('');

  // Play pauses on each step long enough to read its note: a base time plus reading time for the text.
  let timer: number | undefined;
  const dwell = (i: number) => Math.min(8000, 1600 + segs[i].note.length * 42);
  const stop = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; root.querySelector('[data-act="play"]')!.textContent = 'Play'; } };
  const tick = () => {
    if (at >= segs.length - 1) return stop();
    go(at + 1);
    timer = window.setTimeout(tick, dwell(at));
  };

  // The playhead is a child of the grid, but the bars live only in the track column; place it from the track's geometry.
  const placeHead = (t: number) => {
    const grid = root.querySelector<HTMLElement>('.tr-grid')!;
    const track = root.querySelector<HTMLElement>('.tr-track')!;
    const x = track.offsetLeft + (t / END) * track.offsetWidth;
    root.querySelector<HTMLElement>('.tr-head')!.style.left = `${x}px`;
    void grid;
  };
  function draw() {
    const s = segs[at];
    root.querySelectorAll('.tr-seg.active').forEach((e) => e.classList.remove('active'));
    root.querySelector(`.tr-seg[data-i="${at}"]`)?.classList.add('active');
    placeHead(s.t1);
    root.querySelector('.tr-now')!.textContent = `t = ${s.t1} µs`;
    root.querySelector('.tr-cpu')!.textContent = `CPU: ${LANE_NAME[s.lane]}${s.kind === 'stack' ? ' (stacking)' : s.kind === 'unstack' ? ' (returning)' : ''}`;
    root.querySelector('.tr-depth')!.textContent = `Stack: ${s.depth} frame${s.depth === 1 ? '' : 's'}`;
    root.querySelector('.tr-status')!.textContent = `Step ${at + 1} of ${segs.length}. ${s.note}`;
    for (const l of LANES) root.querySelector(`.ln-${l}`)!.classList.toggle('on', l === s.lane);
    root.querySelector<HTMLButtonElement>('[data-act="back"]')!.disabled = at === 0;
    root.querySelector<HTMLButtonElement>('[data-act="step"]')!.disabled = at === segs.length - 1;
  }

  const go = (i: number) => { at = Math.max(0, Math.min(segs.length - 1, i)); draw(); };
  root.addEventListener('click', (e) => {
    const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
    const seg = (e.target as Element).closest<HTMLElement>('.tr-seg');
    if (seg) { stop(); go(Number(seg.dataset.i)); return; }
    if (act === 'step') { stop(); go(at + 1); }
    else if (act === 'back') { stop(); go(at - 1); }
    else if (act === 'restart') { stop(); go(0); }
    else if (act === 'play') {
      if (timer !== undefined) return stop();
      if (at === segs.length - 1) go(0);
      root.querySelector('[data-act="play"]')!.textContent = 'Pause';
      timer = window.setTimeout(tick, dwell(at));
    }
  });
  root.querySelector('.trace')!.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); stop(); go(at + (k === 'ArrowRight' ? 1 : -1)); }
  });
  draw();
  let rt: number | undefined;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => placeHead(segs[at].t1), 100); });
}
