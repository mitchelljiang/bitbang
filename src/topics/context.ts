/**
 * Context switching, as an RTOS such as FreeRTOS does it on a Cortex-M4 without the FPU: SysTick decides to switch and
 * pends PendSV; PendSV saves R4–R11 below the 8 registers the hardware already stacked, swaps the stack pointer kept in
 * each task's control block, restores the other task's R4–R11, and returns, so the hardware unstacks the other task's
 * frame. The trace shows who holds the CPU; the glass below shows the registers and both task stacks at each step.
 */
import { esc } from '../core/render';
import { hexN } from './dbg';
import { stepper, traceHtml, type Bar, type Lane, type Step } from './timeline';

type Who = 'A' | 'B' | 'handler';
export interface CtxState {
  mode: 'Thread' | 'Handler';
  /** The live register values: who R0–R3, R12, LR, PC, xPSR belong to, and who R4–R11 belong to. */
  lo: Who;
  hi: Who;
  psp: number;
  /** pxCurrentTCB: the task the kernel considers running. */
  cur: 'A' | 'B';
  /** The stack pointer saved in each task's control block, or null while that task runs and the copy is stale. */
  tcb: { A: number | null; B: number | null };
  /** Words saved on each task's stack: 0, 8 (the hardware frame) or 16 (plus R4–R11). */
  words: { A: number; B: number };
}

/** Where each task's stack starts: stacks grow down from here. */
export const TOP = { A: 0x20001000, B: 0x20002000 };
/** The hardware-stacked frame, lowest address first, as the ARMv7-M architecture defines it. */
export const HW_FRAME = ['R0', 'R1', 'R2', 'R3', 'R12', 'LR', 'PC', 'xPSR'];
/** STMDB R0!, {R4-R11} stores R4 at the lowest address. */
export const SW_FRAME = ['R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11'];
/** EXC_RETURN for a return to Thread mode on the process stack, without FPU state. */
export const EXC_RETURN = 0xfffffffd;

export interface CtxStep { lane: 'A' | 'B' | 'systick' | 'pendsv'; t0: number; t1: number; kind: 'run' | 'hatch'; note: string; s: CtxState }

const run: CtxState = { mode: 'Thread', lo: 'A', hi: 'A', psp: TOP.A, cur: 'A', tcb: { A: null, B: TOP.B - 64 }, words: { A: 0, B: 16 } };
const at = (o: Partial<CtxState>, prev: CtxState): CtxState => ({ ...prev, ...o, tcb: { ...prev.tcb, ...o.tcb }, words: { ...prev.words, ...o.words } });

/** The switch from task A to task B, one step per bar. Each state follows from the one before. */
export const CTX: CtxStep[] = (() => {
  const s0 = run;
  const s1 = at({ mode: 'Handler', psp: TOP.A - 32, words: { A: 8, B: 16 } }, s0);
  const s2 = at({ lo: 'handler' }, s1);
  const s3 = s2;
  const s4 = at({ words: { A: 16, B: 16 } }, s3);
  const s5 = at({ cur: 'B', tcb: { A: TOP.A - 64, B: TOP.B - 64 } }, s4);
  const s6 = at({ hi: 'B', psp: TOP.B - 32, tcb: { A: TOP.A - 64, B: null }, words: { A: 16, B: 8 } }, s5);
  const s7 = at({ mode: 'Thread', lo: 'B', psp: TOP.B, words: { A: 16, B: 0 } }, s6);
  return [
    { lane: 'A', t0: 0, t1: 20, kind: 'run', s: s0,
      note: 'Task A runs in Thread mode on its own stack: the process stack pointer, PSP, points into A’s stack. Every register holds A’s values. B is suspended; all 16 of its registers are saved on its stack, and its control block remembers where.' },
    { lane: 'systick', t0: 20, t1: 21, kind: 'hatch', s: s1,
      note: 'The SysTick timer fires. The hardware pushes 8 registers, R0–R3, R12, LR, PC and xPSR, onto A’s stack through PSP (32 bytes), switches to Handler mode on the main stack, MSP, and sets LR to <code>0xFFFFFFFD</code>, which means “return to Thread mode on PSP”.' },
    { lane: 'systick', t0: 21, t1: 27, kind: 'run', s: s2,
      note: 'The SysTick handler counts the tick and asks the scheduler whether to switch. A’s time slice is up and B is ready, so it does not switch here: it sets the PendSV pending bit, <code>SCB-&gt;ICSR = PENDSVSET</code>, and returns. R0–R3 now hold the handler’s scratch values; A’s copies are safe on A’s stack.' },
    { lane: 'pendsv', t0: 27, t1: 28, kind: 'hatch', s: s3,
      note: 'PendSV is set to the lowest priority, so it runs only once every other handler has finished. It is pending as SysTick returns, so the processor tail-chains straight into it without unstacking A’s frame.' },
    { lane: 'pendsv', t0: 28, t1: 31, kind: 'run', s: s4,
      note: 'PendSV saves the rest of A: <code>mrs r0, psp</code> reads A’s stack pointer, then <code>stmdb r0!, {r4-r11}</code> pushes R4–R11 below the hardware frame. A’s whole context, 16 words, is now on A’s stack.' },
    { lane: 'pendsv', t0: 31, t1: 34, kind: 'run', s: s5,
      note: 'It swaps stacks by swapping one number. <code>str r0, [A.tcb]</code> saves A’s stack pointer in A’s control block; <code>bl vTaskSwitchContext</code> makes B the current task; <code>ldr r0, [B.tcb]</code> loads where B’s saved context is.' },
    { lane: 'pendsv', t0: 34, t1: 37, kind: 'run', s: s6,
      note: '<code>ldmia r0!, {r4-r11}</code> restores B’s R4–R11 from B’s stack, and <code>msr psp, r0</code> points PSP at B’s hardware frame. The registers now hold a mix: R4–R11 are B’s, R0–R3 are still the handler’s.' },
    { lane: 'B', t0: 37, t1: 38, kind: 'hatch', s: s7,
      note: 'PendSV returns with <code>bx lr</code>. LR still holds <code>0xFFFFFFFD</code>, so the hardware pops 8 registers from PSP, which is now B’s stack: R0–R3, R12, LR, PC and xPSR come back as B left them, and the processor drops to Thread mode.' },
    { lane: 'B', t0: 38, t1: 60, kind: 'run', s: s7,
      note: 'Task B runs, resuming at the exact instruction where it was switched out. It never knew it stopped. A’s 16 words wait on A’s stack until the scheduler switches back the same way.' },
  ];
})();

const OWNER: Record<Who, string> = { A: 'Task A', B: 'Task B', handler: 'handler' };
const val = (w: Who) => `<span class="cs-own o-${w}">${OWNER[w]}</span>`;

/** One task's stack: the hardware frame on top, R4–R11 below, filled or empty, with PSP marked where it points. */
function stackHtml(task: 'A' | 'B', s: CtxState) {
  const n = s.words[task];
  // PSP is drawn in whichever stack it points into, on the edge between blocks it points at: 0, 1 or 2 blocks down.
  const down = (TOP[task] - s.psp) / 32;
  const psp = down >= 0 && down <= 2 ? down : -1;
  const block = (k: 0 | 1, regs: string[], label: string) => {
    const full = n >= 8 * (k + 1);
    const edge = psp === k + 1 ? ' sp-below' : psp === 0 && k === 0 ? ' sp-above' : '';
    return `<div class="cs-blk${full ? ` full o-${task}` : ''}${edge}">
      <span class="cs-regs">${regs.slice().reverse().join(' ')}</span>
      <span class="cs-foot"><small>${full ? label : 'empty'}</small><span class="cs-addr">${hexN(TOP[task] - 32 * (k + 1), 32)}</span></span></div>`;
  };
  return `<div class="cs-stack">
    <h4>Task ${task} stack <small>TCB.sp ${s.tcb[task] === null ? '—' : hexN(s.tcb[task]!, 32)}</small></h4>
    <span class="cs-addr top">${hexN(TOP[task], 32)}</span>
    ${block(0, HW_FRAME, 'saved by hardware')}
    ${block(1, SW_FRAME, 'saved by PendSV')}
  </div>`;
}

export function mountContext(root: HTMLElement) {
  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Running many tasks</p>
      <h1>Context switching</h1>
      <p>A task’s whole state, everything it would need to carry on, is its sixteen core registers. An RTOS switches tasks
        by saving one task’s registers on its own stack, and loading another’s from its stack. On a Cortex-M the hardware
        saves half of them and the kernel saves the other half. Step through one switch from task A to task B and watch
        both stacks.</p>
    </section>
    ${traceHtml({ label: 'Context switch trace', title: 'FreeRTOS on Cortex-M4 · context switch',
      side: `<div class="tr-side cs-side"><div class="cs-cpu"></div><div class="cs-a"></div><div class="cs-b"></div></div>` })}
    <section class="prose">
      <h2>What a context is</h2>
      <p>To stop a task and resume it later as if nothing happened, the kernel must put back every register exactly as it
        was: R0–R12, the stack pointer, the link register, the program counter and the status register. Everything else
        the task owns, its local variables and its call chain, is already on its own stack. So a task is fully described
        by its stack plus one saved number, the stack pointer, which the kernel keeps in the task’s control block, the TCB.</p>
      <h2>Why half is done by hardware</h2>
      <p>Taking any exception already pushes R0–R3, R12, LR, PC and xPSR, the registers a C function may freely
        overwrite. That is what lets an interrupt handler be an ordinary C function. The kernel only has to save the
        other eight, R4–R11, which C code must preserve, so the context switch is a handful of instructions. With the FPU
        in use there are up to 18 more words to save, which the hardware can defer until a task actually touches it.</p>
      <h2>Why PendSV, at the lowest priority</h2>
      <p>The tick interrupt decides that a switch is due, but it does not switch itself. If it did, it might be
        interrupting another handler, and swapping the task stack out from under a running handler would corrupt it.
        Instead it pends PendSV, which is set to the lowest priority, so the switch happens only after every other
        handler has finished and the processor is about to return to a task. Each task runs on PSP while handlers use MSP,
        so handlers never touch task stacks at all.</p>
    </section>`;

  const lanes: Lane[] = [
    { id: 'A', name: 'Task A', sub: 'thread · PSP', color: 'var(--ch2)' },
    { id: 'B', name: 'Task B', sub: 'thread · PSP', color: 'var(--ch3)' },
    { id: 'systick', name: 'SysTick', sub: 'handler · MSP', color: 'var(--ch5)' },
    { id: 'pendsv', name: 'PendSV', sub: 'lowest priority', color: 'var(--ch6)' },
  ];
  const bars: Bar[] = CTX.map((c) => ({ lane: c.lane, t0: c.t0, t1: c.t1, kind: c.kind }));
  const steps: Step[] = CTX.map((c, i) => ({ bar: i, at: c.t1, lane: c.lane, note: c.note,
    readout: [`t = ${c.t1} µs`, `Mode: <b>${c.s.mode}</b>`, `SP: <b>${c.s.mode === 'Thread' ? 'PSP' : 'MSP'}</b>`, `PSP = ${hexN(c.s.psp, 32)}`, `pxCurrentTCB: <b>${c.s.cur}</b>`] }));

  stepper(root, (_, i) => {
    const c = CTX[i].s;
    root.querySelector('.cs-cpu')!.innerHTML = `<h4>CPU registers</h4>
      <dl>
        <dt>R0–R3, R12, LR, PC, xPSR</dt><dd>${val(c.lo)}</dd>
        <dt>R4–R11</dt><dd>${val(c.hi)}</dd>
        <dt>PSP</dt><dd><code>${esc(hexN(c.psp, 32))}</code></dd>
      </dl>`;
    root.querySelector('.cs-a')!.innerHTML = stackHtml('A', c);
    root.querySelector('.cs-b')!.innerHTML = stackHtml('B', c);
  }).load({ lanes, bars, end: 60, every: 10 }, steps);
}
